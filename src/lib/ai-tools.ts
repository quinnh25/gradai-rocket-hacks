/**
 * lib/ai-tools.ts
 * Fixed field names to match actual MongoDB documents:
 *   blockName, creditsRequired, mandatoryCourses, electiveOptions, rules,
 *   programName, programType, totalCredits
 */

import { MongoClient, Db, ObjectId } from "mongodb";

// ─── Gemini Tool Definitions ──────────────────────────────────────────────────

export const GEMINI_TOOLS = [
  {
    function_declarations: [
      {
        name: "get_course",
        description:
          "Fetch full details for a specific course by its code (e.g. 'EECS 281'). " +
          "Returns prerequisites, workload, credits, and all section/availability data. " +
          "Use this when you need specifics about one course before recommending it.",
        parameters: {
          type: "object",
          properties: {
            course_code: {
              type: "string",
              description: "The course code, e.g. 'EECS 281' or 'MATH 215'.",
            },
          },
          required: ["course_code"],
        },
      },
      {
        name: "search_courses",
        description:
          "Search for courses by department, keyword, or credit count. " +
          "Use this to discover elective options or find courses in a subject area. " +
          "Returns up to 20 results with basic info.",
        parameters: {
          type: "object",
          properties: {
            department: {
              type: "string",
              description: "Filter by department prefix, e.g. 'EECS', 'MATH', 'LING'",
            },
            keyword: {
              type: "string",
              description: "Keyword to search in course title or description",
            },
            min_credits: { type: "number" },
            max_credits: { type: "number" },
            exclude_course_codes: {
              type: "array",
              items: { type: "string" },
              description: "Course codes to exclude, e.g. already-completed courses",
            },
          },
          required: [],
        },
      },
      {
        name: "get_student_profile",
        description:
          "Fetch a student's transcript (completed courses), enrolled programs, and preferences. " +
          "Always call this first at the start of any planning session.",
        parameters: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "The Better Auth user ID string",
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "check_requirements",
        description:
          "Check how close a student is to fulfilling all requirements for their enrolled programs. " +
          "Returns a block-by-block breakdown of fulfilled, partial, and missing requirements.",
        parameters: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "The Better Auth user ID string",
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "get_program_requirements",
        description:
          "Fetch the full requirement blocks for a specific program. " +
          "Use this to see exactly which courses are mandatory or optional for a major/minor.",
        parameters: {
          type: "object",
          properties: {
            program_name: {
              type: "string",
              description: "Program name (partial match ok), e.g. 'Computer Engineering'",
            },
            program_type: {
              type: "string",
              description: "'Major' or 'Minor'",
            },
          },
          required: ["program_name"],
        },
      },
      {
        name: "check_schedule_conflicts",
        description:
          "Given a list of course codes, check whether any of their lecture sections conflict. " +
          "Returns conflicting pairs with details, or confirms schedule is clear.",
        parameters: {
          type: "object",
          properties: {
            course_codes: {
              type: "array",
              items: { type: "string" },
              description: "List of course codes to check, e.g. ['EECS 281', 'MATH 216']",
            },
          },
          required: ["course_codes"],
        },
      },
    ],
  },
];

// ─── MongoDB Connection ───────────────────────────────────────────────────────

let _client: MongoClient | null = null;

async function getDb(): Promise<Db> {
  if (!_client) {
    _client = new MongoClient(process.env.DATABASE_URL!);
    await _client.connect();
  }
  return _client.db();
}

type ToolInput = Record<string, unknown>;

// ─── Tool Implementations ─────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  input: ToolInput
): Promise<unknown> {
  const db = await getDb();

  switch (toolName) {

    // ── get_course ────────────────────────────────────────────────────────────
    case "get_course": {
      const course = await db
        .collection("courses")
        .findOne({ course_code: input.course_code as string });

      if (!course) {
        return { error: `Course '${input.course_code}' not found.` };
      }

      return {
        course_code: course.course_code,
        course_title: course.course_title,
        course_description: course.course_description ?? "",
        credits: course.credits,
        school_code: course.school_code,
        term: course.term,
        workload_percent: course.metrics?.workload_percent ?? "N/A",
        prerequisites: course.prerequisites ?? { advisory: "N/A", enforced: "N/A" },
        open_sections: (course.availability ?? []).filter(
          (s: { EnrollmentStatus?: string; Status?: string }) =>
            s.EnrollmentStatus === "open" || s.Status === "Open"
        ).length,
        total_sections: (course.availability ?? []).length,
      };
    }

    // ── search_courses ────────────────────────────────────────────────────────
    case "search_courses": {
      const filter: Record<string, unknown> = {};

      if (input.department) {
        filter.course_code = { $regex: `^${input.department}\\s`, $options: "i" };
      }

      if (input.keyword) {
        const kw = { $regex: input.keyword as string, $options: "i" };
        filter.$or = [{ course_title: kw }, { course_description: kw }];
      }

      if (input.min_credits !== undefined || input.max_credits !== undefined) {
        const cf: Record<string, number> = {};
        if (input.min_credits !== undefined) cf.$gte = input.min_credits as number;
        if (input.max_credits !== undefined) cf.$lte = input.max_credits as number;
        filter.credits = cf;
      }

      if (Array.isArray(input.exclude_course_codes) && input.exclude_course_codes.length > 0) {
        filter.course_code = {
          ...(typeof filter.course_code === "object" ? filter.course_code as object : {}),
          $nin: input.exclude_course_codes,
        };
      }

      const results = await db
        .collection("courses")
        .find(filter, {
          projection: {
            course_code: 1, course_title: 1, credits: 1,
            "metrics.workload_percent": 1, "prerequisites.enforced": 1, _id: 0,
          },
        })
        .limit(20)
        .toArray();

      return {
        count: results.length,
        courses: results.map((c) => ({
          course_code: c.course_code,
          course_title: c.course_title,
          credits: c.credits,
          workload_percent: c.metrics?.workload_percent ?? "N/A",
          enforced_prereqs: c.prerequisites?.enforced ?? "None",
        })),
      };
    }

    // ── get_student_profile ───────────────────────────────────────────────────
    case "get_student_profile": {
      const student = await db
        .collection("students")
        .findOne({ userId: input.user_id as string });

      if (!student) {
        return {
          error: `No student profile found for user ID '${input.user_id}'. ` +
            "The student needs to upload their transcript on the dashboard first.",
        };
      }

      const programIds = (student.enrolledPrograms ?? []).map(
        (id: string) => new ObjectId(id)
      );
      const programs = programIds.length > 0
        ? await db
            .collection("programs")
            .find(
              { _id: { $in: programIds } },
              { projection: { programName: 1, programType: 1, college: 1, totalCredits: 1 } }
            )
            .toArray()
        : [];

      const transcript = student.transcript ?? [];
      const totalCredits = transcript.reduce(
        (sum: number, c: { credits: number }) => sum + (c.credits ?? 0), 0
      );

      return {
        user_id: student.userId,
        enrolled_programs: programs.map((p) => ({
          id: p._id.toString(),
          program_name: p.programName,
          program_type: p.programType,
          college: p.college,
          total_credits_required: p.totalCredits,
        })),
        transcript: transcript.map((c: { course_code: string; credits: number; grade?: string; term?: string }) => ({
          course_code: c.course_code,
          credits: c.credits,
          grade: c.grade ?? "N/A",
          term: c.term ?? "N/A",
        })),
        total_completed_credits: totalCredits,
        preferences: student.preferences ?? {},
      };
    }

    // ── check_requirements ────────────────────────────────────────────────────
    case "check_requirements": {
      const student = await db
        .collection("students")
        .findOne({ userId: input.user_id as string });

      if (!student) {
        return { error: `No student profile found for user ID '${input.user_id}'.` };
      }

      const transcript = student.transcript ?? [];
      const completedSet = new Set(
        transcript.map((c: { course_code: string }) => c.course_code)
      );
      const creditLookup: Record<string, number> = {};
      for (const c of transcript) {
        creditLookup[c.course_code] = c.credits ?? 3;
      }

      const programIds = (student.enrolledPrograms ?? []).map(
        (id: string) => new ObjectId(id)
      );
      const programs = programIds.length > 0
        ? await db.collection("programs").find({ _id: { $in: programIds } }).toArray()
        : [];

      if (programs.length === 0) {
        return {
          error: "No enrolled programs found for this student. " +
            "They need to select their major on the dashboard.",
          transcript_courses: transcript.length,
          suggestion: "Use get_program_requirements to look up 'Computer Engineering' and plan from there.",
        };
      }

      const summary = programs.map((prog) => {
        // ← uses camelCase field names matching your actual MongoDB documents
        const blocks = (prog.requirementBlocks ?? []).map((block: {
          blockName: string;
          creditsRequired: number;
          mandatoryCourses?: string[];
          electiveOptions?: string[];
          rules?: string;
        }) => {
          const mandatory = block.mandatoryCourses ?? [];
          const electives = block.electiveOptions ?? [];
          const creditsRequired = block.creditsRequired ?? 0;

          const metMandatory = mandatory.filter((c) => completedSet.has(c));
          const missingMandatory = mandatory.filter((c) => !completedSet.has(c));
          const metElectives = electives.filter((c) => completedSet.has(c));

          const earned =
            metMandatory.reduce((s, c) => s + (creditLookup[c] ?? 3), 0) +
            metElectives.reduce((s, c) => s + (creditLookup[c] ?? 3), 0);

          const fulfilled = missingMandatory.length === 0 && earned >= creditsRequired;

          return {
            block_name: block.blockName,
            credits_required: creditsRequired,
            credits_earned: earned,
            fulfilled,
            courses_completed: [...metMandatory, ...metElectives],
            mandatory_missing: missingMandatory,
            status: fulfilled
              ? "✅ Complete"
              : missingMandatory.length > 0
              ? `⚠️ Missing required: ${missingMandatory.join(", ")}`
              : `📊 Need ${creditsRequired - earned} more elective credits`,
          };
        });

        return {
          program_name: prog.programName,
          program_type: prog.programType,
          total_credits_required: prog.totalCredits,
          blocks_fulfilled: blocks.filter((b: { fulfilled: boolean }) => b.fulfilled).length,
          blocks_total: blocks.length,
          blocks,
        };
      });

      return { requirement_check: summary };
    }

    // ── get_program_requirements ──────────────────────────────────────────────
    case "get_program_requirements": {
      const filter: Record<string, unknown> = {
        programName: { $regex: input.program_name as string, $options: "i" },
      };
      if (input.program_type) filter.programType = input.program_type;

      const program = await db.collection("programs").findOne(filter);

      if (!program) {
        // List available programs to help the AI pick the right name
        const available = await db
          .collection("programs")
          .find({}, { projection: { programName: 1, programType: 1, _id: 0 } })
          .toArray();
        return {
          error: `Program matching '${input.program_name}' not found.`,
          available_programs: available.map((p) => `${p.programName} (${p.programType})`),
        };
      }

      return {
        program_name: program.programName,
        program_type: program.programType,
        college: program.college,
        total_credits_required: program.totalCredits,
        // ← camelCase to match your actual MongoDB documents
        requirement_blocks: (program.requirementBlocks ?? []).map((b: {
          blockName: string;
          creditsRequired: number;
          mandatoryCourses?: string[];
          electiveOptions?: string[];
          rules?: string;
        }) => ({
          block_name: b.blockName,
          credits_required: b.creditsRequired,
          mandatory_courses: b.mandatoryCourses ?? [],
          elective_options: b.electiveOptions ?? [],
          rules: b.rules ?? "",
        })),
      };
    }

    // ── check_schedule_conflicts ──────────────────────────────────────────────
    case "check_schedule_conflicts": {
      const courseCodes = input.course_codes as string[];

      const courses = await db
        .collection("courses")
        .find({ course_code: { $in: courseCodes } })
        .toArray();

      function parseTime(t: string): { start: number; end: number } | null {
        const m = t.match(/(\d+):(\d+)(AM|PM)\s*-\s*(\d+):(\d+)(AM|PM)/i);
        if (!m) return null;
        let sh = parseInt(m[1]), sm = parseInt(m[2]);
        let eh = parseInt(m[4]), em = parseInt(m[5]);
        if (m[3].toUpperCase() === "PM" && sh !== 12) sh += 12;
        if (m[3].toUpperCase() === "AM" && sh === 12) sh = 0;
        if (m[6].toUpperCase() === "PM" && eh !== 12) eh += 12;
        if (m[6].toUpperCase() === "AM" && eh === 12) eh = 0;
        return { start: sh * 60 + sm, end: eh * 60 + em };
      }

      function daysOverlap(a: string, b: string): boolean {
        const expand = (d: string) => {
          const map: Record<string, string[]> = {
            Mo: ["Mo"], Tu: ["Tu"], We: ["We"], Th: ["Th"], Fr: ["Fr"],
            MoWe: ["Mo", "We"], TuTh: ["Tu", "Th"], MoWeFr: ["Mo", "We", "Fr"],
          };
          return map[d] ?? [d];
        };
        return expand(a).some((d) => expand(b).includes(d));
      }

      const conflicts: { course1: string; course2: string; reason: string }[] = [];

      for (let i = 0; i < courses.length; i++) {
        for (let j = i + 1; j < courses.length; j++) {
          const a = courses[i], b = courses[j];
          const aLecs = (a.availability ?? []).filter((s: { SectionType?: string }) => s.SectionType === "LEC");
          const bLecs = (b.availability ?? []).filter((s: { SectionType?: string }) => s.SectionType === "LEC");

          for (const sA of aLecs) {
            for (const mA of (sA.Meetings ?? [])) {
              if (!mA.Days || mA.Days === "TBA" || !mA.Times || mA.Times === "TBA") continue;
              for (const sB of bLecs) {
                for (const mB of (sB.Meetings ?? [])) {
                  if (!mB.Days || mB.Days === "TBA" || !mB.Times || mB.Times === "TBA") continue;
                  if (!daysOverlap(mA.Days, mB.Days)) continue;
                  const tA = parseTime(mA.Times), tB = parseTime(mB.Times);
                  if (!tA || !tB) continue;
                  if (tA.start < tB.end && tA.end > tB.start) {
                    conflicts.push({
                      course1: a.course_code,
                      course2: b.course_code,
                      reason: `${mA.Days} ${mA.Times} overlaps with ${mB.Days} ${mB.Times}`,
                    });
                  }
                }
              }
            }
          }
        }
      }

      const foundCodes = new Set(courses.map((c) => c.course_code));
      const notFound = courseCodes.filter((c) => !foundCodes.has(c));

      return {
        has_conflicts: conflicts.length > 0,
        conflicts,
        courses_not_found: notFound,
        message: conflicts.length === 0
          ? `✅ No conflicts among: ${courseCodes.join(", ")}`
          : `⚠️ ${conflicts.length} conflict(s) detected`,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
