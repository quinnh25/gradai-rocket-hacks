/**
 * lib/ai-tools.ts
 *
 * Tool definitions for the GradAI planning LLM.
 * These are passed to the Anthropic API as tools so the AI can
 * query the database contextually during plan generation.
 *
 * Usage in your API route:
 *   import { AI_TOOLS, executeTool } from "@/lib/ai-tools";
 *   const response = await anthropic.messages.create({
 *     model: "claude-sonnet-4-20250514",
 *     tools: AI_TOOLS,
 *     messages: [...],
 *   });
 */

import { MongoClient, Db, ObjectId } from "mongodb";
import clientPromise from "@/lib/prisma"; // or your mongo client

// ─── Tool Definitions (passed to Anthropic API) ───────────────────────────────

export const AI_TOOLS = [
  {
    name: "get_course",
    description:
      "Fetch full details for a specific course by its ID (e.g. 'EECS 281'). " +
      "Use this when you need prerequisites, schedule times, workload, or section availability for one course.",
    input_schema: {
      type: "object",
      properties: {
        courseId: {
          type: "string",
          description: "The course identifier, e.g. 'EECS 281' or 'MATH 215'",
        },
      },
      required: ["courseId"],
    },
  },
  {
    name: "search_courses",
    description:
      "Search for courses by department, tags, keywords, or credit count. " +
      "Use this to find courses matching student interests or to discover elective options. " +
      "Returns up to 20 results with basic info (no full section data).",
    input_schema: {
      type: "object",
      properties: {
        department: {
          type: "string",
          description: "Filter by department code, e.g. 'EECS', 'MATH', 'LING'",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter by tags such as 'machine-learning', 'algorithms', 'low-workload', 'lab-required', '4-credit'",
        },
        keyword: {
          type: "string",
          description: "Keyword to search in title and description",
        },
        minCredits: { type: "number" },
        maxCredits: { type: "number" },
        excludeCourseIds: {
          type: "array",
          items: { type: "string" },
          description: "CourseIds to exclude (e.g. already completed courses)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_student_profile",
    description:
      "Fetch a student's transcript (completed courses + grades), enrolled programs, and preferences. " +
      "Use this at the start of any planning session to understand what the student has done and wants.",
    input_schema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The Better Auth user ID",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "check_requirements",
    description:
      "Check how close a student is to fulfilling all requirements for their enrolled programs. " +
      "Returns a block-by-block breakdown: which blocks are fulfilled, which are partially met, " +
      "which are missing, and which specific courses still need to be taken.",
    input_schema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The Better Auth user ID",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "get_program_requirements",
    description:
      "Fetch the full requirement blocks for a specific program. " +
      "Use this when you need to know exactly which courses are mandatory or optional for a major/minor.",
    input_schema: {
      type: "object",
      properties: {
        programName: {
          type: "string",
          description:
            "Program name, e.g. 'Computer Engineering' or 'Electrical Engineering Major'",
        },
        programType: {
          type: "string",
          description: "'Major' or 'Minor'",
        },
      },
      required: ["programName"],
    },
  },
  {
    name: "check_schedule_conflicts",
    description:
      "Given a list of courseIds and a term, check whether any of their lecture/lab sections conflict. " +
      "Returns conflicting pairs if any exist, or confirms the schedule is clear.",
    input_schema: {
      type: "object",
      properties: {
        courseIds: {
          type: "array",
          items: { type: "string" },
          description: "List of courseIds to check together",
        },
        term: {
          type: "string",
          description: "Term code, e.g. '2610'",
        },
      },
      required: ["courseIds", "term"],
    },
  },
];

// ─── Tool Implementations ─────────────────────────────────────────────────────

let _client: MongoClient | null = null;
async function getDb(): Promise<Db> {
  if (!_client) {
    _client = new MongoClient(process.env.DATABASE_URL!);
    await _client.connect();
  }
  return _client.db();
}

type ToolInput = Record<string, unknown>;

export async function executeTool(
  toolName: string,
  input: ToolInput
): Promise<unknown> {
  const db = await getDb();

  switch (toolName) {
    case "get_course": {
      const course = await db
        .collection("courses")
        .findOne({ courseId: input.courseId });
      if (!course) return { error: `Course ${input.courseId} not found` };
      return course;
    }

    case "search_courses": {
      const filter: Record<string, unknown> = {};
      if (input.department) filter.department = input.department;
      if (input.tags && Array.isArray(input.tags) && input.tags.length > 0) {
        filter.tags = { $all: input.tags };
      }
      if (input.keyword) {
        filter.$or = [
          { title: { $regex: input.keyword, $options: "i" } },
          { description: { $regex: input.keyword, $options: "i" } },
        ];
      }
      if (input.minCredits !== undefined || input.maxCredits !== undefined) {
        filter.credits = {};
        if (input.minCredits !== undefined)
          (filter.credits as Record<string, number>).$gte = input.minCredits as number;
        if (input.maxCredits !== undefined)
          (filter.credits as Record<string, number>).$lte = input.maxCredits as number;
      }
      if (
        input.excludeCourseIds &&
        Array.isArray(input.excludeCourseIds) &&
        input.excludeCourseIds.length > 0
      ) {
        filter.courseId = { $nin: input.excludeCourseIds };
      }

      const results = await db
        .collection("courses")
        .find(filter, {
          projection: {
            courseId: 1,
            title: 1,
            credits: 1,
            workload: 1,
            tags: 1,
            prerequisites: 1,
            _id: 0,
          },
        })
        .limit(20)
        .toArray();

      return { count: results.length, courses: results };
    }

    case "get_student_profile": {
      const student = await db
        .collection("students")
        .findOne({ userId: input.userId });
      if (!student) return { error: "Student profile not found" };

      // Hydrate program names for context
      const programs = await db
        .collection("programs")
        .find(
          { _id: { $in: (student.enrolledPrograms ?? []).map((id: string) => new ObjectId(id)) } },
          { projection: { programName: 1, programType: 1, totalCredits: 1 } }
        )
        .toArray();

      return {
        transcript: student.transcript ?? [],
        preferences: student.preferences ?? {},
        enrolledPrograms: programs,
        totalCompletedCredits: (student.transcript ?? []).reduce(
          (sum: number, c: { credits: number }) => sum + (c.credits ?? 0),
          0
        ),
      };
    }

    case "check_requirements": {
      const student = await db
        .collection("students")
        .findOne({ userId: input.userId });
      if (!student) return { error: "Student profile not found" };

      const completedIds: string[] = (student.transcript ?? []).map(
        (c: { courseId: string }) => c.courseId
      );
      const completedCredits: Record<string, number> = {};
      for (const c of student.transcript ?? []) {
        completedCredits[c.courseId] = c.credits;
      }

      const programs = await db
        .collection("programs")
        .find({
          _id: { $in: (student.enrolledPrograms ?? []).map((id: string) => new ObjectId(id)) },
        })
        .toArray();

      const summary = [];

      for (const prog of programs) {
        const progSummary: {
          programName: string;
          programType: string;
          totalRequired: number;
          blocks: Array<{
            blockName: string;
            creditsRequired: number;
            creditsEarned: number;
            fulfilled: boolean;
            coursesMet: string[];
            coursesMissing: string[];
            notes: string;
          }>;
        } = {
          programName: prog.programName,
          programType: prog.programType,
          totalRequired: prog.totalCredits,
          blocks: [],
        };

        for (const block of prog.requirementBlocks ?? []) {
          const mandatory: string[] = block.mandatoryCourses ?? [];
          const electives: string[] = block.electiveOptions ?? [];

          const metMandatory = mandatory.filter((c: string) => completedIds.includes(c));
          const missingMandatory = mandatory.filter((c: string) => !completedIds.includes(c));

          const metElectives = electives.filter((c: string) => completedIds.includes(c));
          const electiveCreditsEarned = metElectives.reduce(
            (sum: number, c: string) => sum + (completedCredits[c] ?? 3),
            0
          );
          const mandatoryCreditsEarned = metMandatory.reduce(
            (sum: number, c: string) => sum + (completedCredits[c] ?? 3),
            0
          );

          const totalEarned = mandatoryCreditsEarned + electiveCreditsEarned;
          const fulfilled =
            missingMandatory.length === 0 && totalEarned >= block.creditsRequired;

          progSummary.blocks.push({
            blockName: block.blockName,
            creditsRequired: block.creditsRequired,
            creditsEarned: totalEarned,
            fulfilled,
            coursesMet: [...metMandatory, ...metElectives],
            coursesMissing: missingMandatory,
            notes: fulfilled
              ? "✅ Complete"
              : missingMandatory.length > 0
              ? `⚠️ Missing required: ${missingMandatory.join(", ")}`
              : `📊 Need ${block.creditsRequired - totalEarned} more credits from electives`,
          });
        }

        summary.push(progSummary);
      }

      return { requirementCheck: summary };
    }

    case "get_program_requirements": {
      const filter: Record<string, unknown> = {
        programName: { $regex: input.programName, $options: "i" },
      };
      if (input.programType) filter.programType = input.programType;

      const program = await db.collection("programs").findOne(filter);
      if (!program) return { error: `Program "${input.programName}" not found` };
      return program;
    }

    case "check_schedule_conflicts": {
      const courseIds = input.courseIds as string[];
      const term = input.term as string;

      const courses = await db
        .collection("courses")
        .find({ courseId: { $in: courseIds }, term })
        .project({ courseId: 1, title: 1, sections: 1 })
        .toArray();

      // Parse times into comparable minutes-since-midnight
      function parseTime(timeStr: string): { start: number; end: number } | null {
        const match = timeStr.match(/(\d+):(\d+)(AM|PM)\s*-\s*(\d+):(\d+)(AM|PM)/);
        if (!match) return null;
        let startH = parseInt(match[1]);
        const startM = parseInt(match[2]);
        const startPeriod = match[3];
        let endH = parseInt(match[4]);
        const endM = parseInt(match[5]);
        const endPeriod = match[6];
        if (startPeriod === "PM" && startH !== 12) startH += 12;
        if (startPeriod === "AM" && startH === 12) startH = 0;
        if (endPeriod === "PM" && endH !== 12) endH += 12;
        if (endPeriod === "AM" && endH === 12) endH = 0;
        return { start: startH * 60 + startM, end: endH * 60 + endM };
      }

      function daysOverlap(a: string, b: string): boolean {
        const dayMap: Record<string, string[]> = {
          Mo: ["Mo"], Tu: ["Tu"], We: ["We"], Th: ["Th"], Fr: ["Fr"],
          MoWe: ["Mo", "We"], TuTh: ["Tu", "Th"],
          MoWeFr: ["Mo", "We", "Fr"],
        };
        const daysA = dayMap[a] ?? [a];
        const daysB = dayMap[b] ?? [b];
        return daysA.some((d) => daysB.includes(d));
      }

      const conflicts: { course1: string; course2: string; reason: string }[] = [];

      // Check each pair
      for (let i = 0; i < courses.length; i++) {
        for (let j = i + 1; j < courses.length; j++) {
          const a = courses[i];
          const b = courses[j];

          const aSections = (a.sections ?? []).filter(
            (s: { sectionType: string }) => s.sectionType === "LEC"
          );
          const bSections = (b.sections ?? []).filter(
            (s: { sectionType: string }) => s.sectionType === "LEC"
          );

          for (const sA of aSections) {
            for (const mA of sA.meetings ?? []) {
              for (const sB of bSections) {
                for (const mB of sB.meetings ?? []) {
                  if (mA.days === "TBA" || mB.days === "TBA") continue;
                  if (!daysOverlap(mA.days, mB.days)) continue;
                  const tA = parseTime(mA.times);
                  const tB = parseTime(mB.times);
                  if (!tA || !tB) continue;
                  if (tA.start < tB.end && tA.end > tB.start) {
                    conflicts.push({
                      course1: a.courseId,
                      course2: b.courseId,
                      reason: `${mA.days} ${mA.times} overlaps with ${mB.days} ${mB.times}`,
                    });
                  }
                }
              }
            }
          }
        }
      }

      return {
        hasConflicts: conflicts.length > 0,
        conflicts,
        message:
          conflicts.length === 0
            ? "✅ No schedule conflicts found"
            : `⚠️ ${conflicts.length} conflict(s) detected`,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
