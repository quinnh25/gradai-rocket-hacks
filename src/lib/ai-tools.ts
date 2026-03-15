/**
 * lib/ai-tools.ts
 *
 * Tool definitions for GradAI — written for the Gemini REST API.
 *
 * Gemini uses a different tool schema than Anthropic:
 *   - Tools are grouped under `function_declarations` inside a `tools` array
 *   - Each function has: name, description, parameters (JSON Schema)
 *   - Tool results are sent back as { role: "user", parts: [{ functionResponse: ... }] }
 *
 * Field names here match your ACTUAL MongoDB documents:
 *   courses:  course_code, course_title, credits, availability[], metrics.workload_percent,
 *             prerequisites.advisory / .enforced, school_code, term
 *   programs: program_name, program_type, college, overall_total_credits,
 *             requirement_blocks[].block_name, .mandatory_courses[], .elective_options[],
 *             .credits_required_for_block, .rules_and_restrictions
 *   students: userId, enrolledPrograms[], transcript[], preferences
 *
 * Usage in your API route:
 *   import { GEMINI_TOOLS, executeTool } from "@/lib/ai-tools";
 */

import { MongoClient, Db, ObjectId } from "mongodb";

// ─── Gemini Tool Definitions ──────────────────────────────────────────────────
// These are passed directly to the Gemini API as the `tools` array.
// Gemini groups all functions under `function_declarations` in one tools object.

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
              description:
                "The course code, e.g. 'EECS 281' or 'MATH 215'. Must include the space.",
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
          "Returns up to 20 results with basic info (no full section data).",
        parameters: {
          type: "object",
          properties: {
            department: {
              type: "string",
              description:
                "Filter by department prefix, e.g. 'EECS', 'MATH', 'STATS'",
            },
            keyword: {
              type: "string",
              description:
                "Keyword to search in course title or description, e.g. 'machine learning'",
            },
            min_credits: {
              type: "number",
              description: "Minimum credit hours (inclusive)",
            },
            max_credits: {
              type: "number",
              description: "Maximum credit hours (inclusive)",
            },
            exclude_course_codes: {
              type: "array",
              items: { type: "string" },
              description:
                "Course codes to exclude from results, e.g. already-completed courses",
            },
          },
          required: [],
        },
      },
      {
        name: "get_student_profile",
        description:
          "Fetch a student's transcript (completed courses + grades), enrolled programs, " +
          "and preferences. Always call this first at the start of any planning session " +
          "to understand what the student has already done.",
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
          "Returns a block-by-block breakdown: which blocks are fulfilled, which are partially met, " +
          "which are missing, and which specific courses still need to be taken.",
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
          "Use this when you need to know exactly which courses are mandatory or optional " +
          "for a given major or minor.",
        parameters: {
          type: "object",
          properties: {
            program_name: {
              type: "string",
              description:
                "Program name (partial match ok), e.g. 'Computer Engineering' or 'Electrical Engineering'",
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
          "Given a list of course codes, check whether any of their lecture sections conflict " +
          "in the current term. Returns conflicting pairs with details, or confirms schedule is clear.",
        parameters: {
          type: "object",
          properties: {
            course_codes: {
              type: "array",
              items: { type: "string" },
              description:
                "List of course codes to check together, e.g. ['EECS 281', 'MATH 216']",
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

// ─── Type Helpers ─────────────────────────────────────────────────────────────

type ToolInput = Record<string, unknown>;

// Shape of a course document in your MongoDB `courses` collection
interface CourseDoc {
  course_code: string;
  course_title: string;
  course_description?: string;
  credits: number;
  school_code: string;
  term: string;
  metrics?: { workload_percent?: string };
  prerequisites?: { advisory?: string; enforced?: string };
  availability?: SectionDoc[];
  [key: string]: unknown;
}

interface SectionDoc {
  SectionType?: string;
  SectionTypeDescr?: string;
  Status?: string;
  EnrollmentStatus?: string;
  AvailableSeats?: number;
  Meetings?: MeetingDoc[];
  [key: string]: unknown;
}

interface MeetingDoc {
  Days?: string;
  Times?: string;
  Location?: string;
  Instructor?: string;
  [key: string]: unknown;
}

// Shape of a program document
interface ProgramDoc {
  _id: ObjectId;
  program_name: string;
  program_type: string;
  college: string;
  overall_total_credits: number;
  requirement_blocks?: RequirementBlock[];
  [key: string]: unknown;
}

interface RequirementBlock {
  block_name: string;
  credits_required_for_block: number;
  mandatory_courses?: string[];
  elective_options?: string[];
  rules_and_restrictions?: string;
  [key: string]: unknown;
}

// Shape of a student document
interface StudentDoc {
  userId: string;
  enrolledPrograms?: string[];
  transcript?: TranscriptEntry[];
  preferences?: Record<string, unknown>;
  [key: string]: unknown;
}

interface TranscriptEntry {
  course_code: string;
  credits: number;
  grade?: string;
  term?: string;
  [key: string]: unknown;
}

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
        .collection<CourseDoc>("courses")
        .findOne({ course_code: input.course_code as string });

      if (!course) {
        return { error: `Course '${input.course_code}' not found in the catalog.` };
      }

      // Return a clean summary — full availability array can be huge
      return {
        course_code: course.course_code,
        course_title: course.course_title,
        course_description: course.course_description ?? "",
        credits: course.credits,
        school_code: course.school_code,
        term: course.term,
        workload_percent: course.metrics?.workload_percent ?? "N/A",
        prerequisites: course.prerequisites ?? { advisory: "N/A", enforced: "N/A" },
        sections_summary: (course.availability ?? []).map((s) => ({
          section_type: s.SectionType,
          status: s.Status,
          available_seats: s.AvailableSeats,
          meetings: (s.Meetings ?? []).map((m) => ({
            days: m.Days,
            times: m.Times,
            location: m.Location,
          })),
        })),
        total_sections: (course.availability ?? []).length,
        open_sections: (course.availability ?? []).filter(
          (s) =>
            s.EnrollmentStatus === "open" ||
            s.Status === "Open"
        ).length,
      };
    }

    // ── search_courses ────────────────────────────────────────────────────────
    case "search_courses": {
      const filter: Record<string, unknown> = {};

      // Filter by department prefix (course_code starts with "DEPT ")
      if (input.department) {
        filter.course_code = {
          $regex: `^${input.department}\\s`,
          $options: "i",
        };
      }

      // Keyword search in title or description
      if (input.keyword) {
        const kw = { $regex: input.keyword as string, $options: "i" };
        if (filter.course_code) {
          // Combine department filter with keyword using $and
          filter.$and = [
            { course_code: filter.course_code },
            { $or: [{ course_title: kw }, { course_description: kw }] },
          ];
          delete filter.course_code;
        } else {
          filter.$or = [{ course_title: kw }, { course_description: kw }];
        }
      }

      // Credit range
      if (input.min_credits !== undefined || input.max_credits !== undefined) {
        const creditFilter: Record<string, number> = {};
        if (input.min_credits !== undefined)
          creditFilter.$gte = input.min_credits as number;
        if (input.max_credits !== undefined)
          creditFilter.$lte = input.max_credits as number;
        filter.credits = creditFilter;
      }

      // Exclude already-completed courses
      if (
        input.exclude_course_codes &&
        Array.isArray(input.exclude_course_codes) &&
        input.exclude_course_codes.length > 0
      ) {
        filter.course_code = {
          ...(typeof filter.course_code === "object" ? (filter.course_code as object) : {}),
          $nin: input.exclude_course_codes,
        };
      }

      const results = await db
        .collection<CourseDoc>("courses")
        .find(filter, {
          projection: {
            course_code: 1,
            course_title: 1,
            credits: 1,
            "metrics.workload_percent": 1,
            "prerequisites.enforced": 1,
            _id: 0,
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
        .collection<StudentDoc>("students")
        .findOne({ userId: input.user_id as string });

      if (!student) {
        return {
          error: `No student profile found for user ID '${input.user_id}'. ` +
            "The student may need to complete onboarding first.",
        };
      }

      // Hydrate enrolled program names
      const programIds = (student.enrolledPrograms ?? []).map(
        (id) => new ObjectId(id)
      );
      const programs = await db
        .collection<ProgramDoc>("programs")
        .find(
          { _id: { $in: programIds } },
          {
            projection: {
              program_name: 1,
              program_type: 1,
              college: 1,
              overall_total_credits: 1,
            },
          }
        )
        .toArray();

      const transcript = student.transcript ?? [];
      const totalCompletedCredits = transcript.reduce(
        (sum, c) => sum + (c.credits ?? 0),
        0
      );

      return {
        user_id: student.userId,
        enrolled_programs: programs.map((p) => ({
          id: p._id.toString(),
          program_name: p.program_name,
          program_type: p.program_type,
          college: p.college,
          total_credits_required: p.overall_total_credits,
        })),
        transcript: transcript.map((c) => ({
          course_code: c.course_code,
          credits: c.credits,
          grade: c.grade ?? "N/A",
          term: c.term ?? "N/A",
        })),
        total_completed_credits: totalCompletedCredits,
        preferences: student.preferences ?? {},
      };
    }

    // ── check_requirements ────────────────────────────────────────────────────
    case "check_requirements": {
      const student = await db
        .collection<StudentDoc>("students")
        .findOne({ userId: input.user_id as string });

      if (!student) {
        return { error: `No student profile found for user ID '${input.user_id}'.` };
      }

      // Build sets of completed course codes and a credit lookup
      const transcript = student.transcript ?? [];
      const completedSet = new Set(transcript.map((c) => c.course_code));
      const creditLookup: Record<string, number> = {};
      for (const c of transcript) {
        creditLookup[c.course_code] = c.credits ?? 3;
      }

      // Load enrolled programs with full requirement data
      const programIds = (student.enrolledPrograms ?? []).map(
        (id) => new ObjectId(id)
      );
      const programs = await db
        .collection<ProgramDoc>("programs")
        .find({ _id: { $in: programIds } })
        .toArray();

      const summary = programs.map((prog) => {
        const blocks = (prog.requirement_blocks ?? []).map((block) => {
          const mandatory = block.mandatory_courses ?? [];
          const electives = block.elective_options ?? [];
          const creditsRequired = block.credits_required_for_block ?? 0;

          const metMandatory = mandatory.filter((c) => completedSet.has(c));
          const missingMandatory = mandatory.filter((c) => !completedSet.has(c));

          const metElectives = electives.filter((c) => completedSet.has(c));
          const electiveCreditsEarned = metElectives.reduce(
            (sum, c) => sum + (creditLookup[c] ?? 3),
            0
          );
          const mandatoryCreditsEarned = metMandatory.reduce(
            (sum, c) => sum + (creditLookup[c] ?? 3),
            0
          );

          const totalEarned = mandatoryCreditsEarned + electiveCreditsEarned;
          const fulfilled =
            missingMandatory.length === 0 && totalEarned >= creditsRequired;

          let status: string;
          if (fulfilled) {
            status = "✅ Complete";
          } else if (missingMandatory.length > 0) {
            status = `⚠️ Missing required: ${missingMandatory.join(", ")}`;
          } else {
            status = `📊 Need ${creditsRequired - totalEarned} more credits from electives`;
          }

          return {
            block_name: block.block_name,
            credits_required: creditsRequired,
            credits_earned: totalEarned,
            fulfilled,
            courses_completed: [...metMandatory, ...metElectives],
            mandatory_missing: missingMandatory,
            status,
          };
        });

        const fulfilledBlocks = blocks.filter((b) => b.fulfilled).length;

        return {
          program_name: prog.program_name,
          program_type: prog.program_type,
          total_credits_required: prog.overall_total_credits,
          blocks_fulfilled: fulfilledBlocks,
          blocks_total: blocks.length,
          blocks,
        };
      });

      return { requirement_check: summary };
    }

    // ── get_program_requirements ──────────────────────────────────────────────
    case "get_program_requirements": {
      const filter: Record<string, unknown> = {
        program_name: {
          $regex: input.program_name as string,
          $options: "i",
        },
      };
      if (input.program_type) {
        filter.program_type = input.program_type;
      }

      const program = await db
        .collection<ProgramDoc>("programs")
        .findOne(filter);

      if (!program) {
        return {
          error: `Program matching '${input.program_name}' not found. ` +
            "Try a shorter search term like 'Computer Engineering' or 'Electrical'.",
        };
      }

      return {
        program_name: program.program_name,
        program_type: program.program_type,
        college: program.college,
        total_credits_required: program.overall_total_credits,
        requirement_blocks: (program.requirement_blocks ?? []).map((b) => ({
          block_name: b.block_name,
          credits_required: b.credits_required_for_block,
          mandatory_courses: b.mandatory_courses ?? [],
          elective_options: b.elective_options ?? [],
          rules: b.rules_and_restrictions ?? "",
        })),
      };
    }

    // ── check_schedule_conflicts ──────────────────────────────────────────────
    case "check_schedule_conflicts": {
      const courseCodes = input.course_codes as string[];

      const courses = await db
        .collection<CourseDoc>("courses")
        .find({ course_code: { $in: courseCodes } })
        .project<CourseDoc>({ course_code: 1, course_title: 1, availability: 1 })
        .toArray();

      // Helper: parse "8:30AM - 10:00AM" → { start: minutes, end: minutes }
      function parseTime(timeStr: string): { start: number; end: number } | null {
        const match = timeStr.match(
          /(\d+):(\d+)(AM|PM)\s*-\s*(\d+):(\d+)(AM|PM)/i
        );
        if (!match) return null;

        let startH = parseInt(match[1]);
        const startM = parseInt(match[2]);
        const startPeriod = match[3].toUpperCase();
        let endH = parseInt(match[4]);
        const endM = parseInt(match[5]);
        const endPeriod = match[6].toUpperCase();

        if (startPeriod === "PM" && startH !== 12) startH += 12;
        if (startPeriod === "AM" && startH === 12) startH = 0;
        if (endPeriod === "PM" && endH !== 12) endH += 12;
        if (endPeriod === "AM" && endH === 12) endH = 0;

        return { start: startH * 60 + startM, end: endH * 60 + endM };
      }

      // Helper: check if two day-strings share any days
      // Handles: "Mo", "Tu", "We", "Th", "Fr", "TuTh", "MoWe", "MoWeFr", etc.
      function daysOverlap(a: string, b: string): boolean {
        const expand = (d: string): string[] => {
          const map: Record<string, string[]> = {
            Mo: ["Mo"],
            Tu: ["Tu"],
            We: ["We"],
            Th: ["Th"],
            Fr: ["Fr"],
            MoWe: ["Mo", "We"],
            TuTh: ["Tu", "Th"],
            MoWeFr: ["Mo", "We", "Fr"],
          };
          return map[d] ?? d.match(/.{2}/g) ?? [d];
        };
        const daysA = expand(a);
        const daysB = expand(b);
        return daysA.some((d) => daysB.includes(d));
      }

      const conflicts: { course1: string; course2: string; reason: string }[] = [];

      for (let i = 0; i < courses.length; i++) {
        for (let j = i + 1; j < courses.length; j++) {
          const a = courses[i];
          const b = courses[j];

          // Only check lecture sections against each other
          const aLecs = (a.availability ?? []).filter(
            (s) => s.SectionType === "LEC"
          );
          const bLecs = (b.availability ?? []).filter(
            (s) => s.SectionType === "LEC"
          );

          for (const sA of aLecs) {
            for (const mA of sA.Meetings ?? []) {
              if (!mA.Days || mA.Days === "TBA" || !mA.Times || mA.Times === "TBA") continue;

              for (const sB of bLecs) {
                for (const mB of sB.Meetings ?? []) {
                  if (!mB.Days || mB.Days === "TBA" || !mB.Times || mB.Times === "TBA") continue;

                  if (!daysOverlap(mA.Days, mB.Days)) continue;

                  const tA = parseTime(mA.Times);
                  const tB = parseTime(mB.Times);
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

      // Note any requested courses not found in DB
      const foundCodes = new Set(courses.map((c) => c.course_code));
      const notFound = courseCodes.filter((c) => !foundCodes.has(c));

      return {
        has_conflicts: conflicts.length > 0,
        conflicts,
        courses_not_found: notFound,
        message:
          conflicts.length === 0
            ? `✅ No schedule conflicts among: ${courseCodes.join(", ")}`
            : `⚠️ ${conflicts.length} conflict(s) detected`,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}