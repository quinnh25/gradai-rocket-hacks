/**
 * app/api/schedule/route.ts
 *
 * POST /api/schedule
 *
 * Asks Gemini to produce a structured weekly schedule JSON from a list of
 * course codes and a term, by looking up real section times from the DB.
 *
 * Request body:
 *   { userId: string, courseCodes: string[], term: string }
 *   term: "2570" (Winter 2026) | "2610" (Fall 2025/2026)
 *
 * Response:
 *   { schedule: ScheduleOutput }
 */

import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

let _client: MongoClient | null = null;
async function getDb() {
  if (!_client) {
    _client = new MongoClient(process.env.DATABASE_URL!);
    await _client.connect();
  }
  return _client.db();
}

export interface ScheduledCourse {
  courseCode: string;
  title: string;
  credits: number;
  color: string; // hex color for calendar display
  sections: ScheduledSection[];
}

export interface ScheduledSection {
  sectionType: string; // "LEC" | "LAB" | "DIS"
  sectionNumber: string;
  instructor: string;
  meetings: ScheduledMeeting[];
}

export interface ScheduledMeeting {
  days: string[];  // ["Mo", "We"] etc
  startTime: string; // "10:00"  24hr
  endTime: string;   // "11:30"  24hr
  location: string;
}

export interface ScheduleOutput {
  term: string;
  termLabel: string;
  totalCredits: number;
  courses: ScheduledCourse[];
}

// Assign a distinct color to each course
const COURSE_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#EF4444", // red
  "#06B6D4", // cyan
  "#F97316", // orange
  "#6366F1", // indigo
];

// Parse "8:30AM - 10:00AM" → { startTime: "08:30", endTime: "10:00" }
function parseTimeRange(timeStr: string): { startTime: string; endTime: string } | null {
  const match = timeStr.match(/(\d+):(\d+)(AM|PM)\s*-\s*(\d+):(\d+)(AM|PM)/i);
  if (!match) return null;

  let sh = parseInt(match[1]);
  const sm = parseInt(match[2]);
  const sp = match[3].toUpperCase();
  let eh = parseInt(match[4]);
  const em = parseInt(match[5]);
  const ep = match[6].toUpperCase();

  if (sp === "PM" && sh !== 12) sh += 12;
  if (sp === "AM" && sh === 12) sh = 0;
  if (ep === "PM" && eh !== 12) eh += 12;
  if (ep === "AM" && eh === 12) eh = 0;

  return {
    startTime: `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`,
    endTime: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`,
  };
}

// Expand "MoWe" → ["Mo", "We"], "TuTh" → ["Tu", "Th"] etc
function expandDays(daysStr: string): string[] {
  const map: Record<string, string[]> = {
    Mo: ["Mo"], Tu: ["Tu"], We: ["We"], Th: ["Th"], Fr: ["Fr"],
    MoWe: ["Mo", "We"],
    TuTh: ["Tu", "Th"],
    MoWeFr: ["Mo", "We", "Fr"],
    MoTuWeTh: ["Mo", "Tu", "We", "Th"],
  };
  return map[daysStr] ?? daysStr.match(/.{2}/g) ?? [daysStr];
}

export async function POST(req: NextRequest) {
  try {
    const { userId, courseCodes, term } = await req.json() as {
      userId: string;
      courseCodes: string[];
      term: string;
    };

    if (!courseCodes?.length) {
      return NextResponse.json({ error: "courseCodes required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    // Fetch course data from DB
    const db = await getDb();
    const courses = await db
      .collection("courses")
      .find({ courseId: { $in: courseCodes } })
      .toArray();

    if (courses.length === 0) {
      return NextResponse.json({ error: "No courses found in database" }, { status: 404 });
    }

    // Build structured schedule directly from DB data (no Gemini needed for this)
    // Use Gemini only to pick the best section for each course
    const courseDataForGemini = courses.map((c) => ({
      courseId: c.courseId,
      title: c.title,
      credits: c.credits,
      sections: (c.sections ?? []).map((s: {
        sectionType: string;
        sectionNumber: string;
        instructors: string[];
        meetings: { days: string; times: string; location: string }[];
        enrollmentStatus: string;
        availableSeats: number;
      }) => ({
        sectionType: s.sectionType,
        sectionNumber: s.sectionNumber,
        instructors: s.instructors,
        meetings: s.meetings,
        enrollmentStatus: s.enrollmentStatus,
        availableSeats: s.availableSeats,
      })),
    }));

    // Ask Gemini to pick the best non-conflicting sections
    const geminiResp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are a schedule builder. Given the following courses and their available sections, 
pick the best combination of sections (one LEC per course, plus any required LAB/DIS) that:
1. Has no time conflicts
2. Prefers open sections over waitlisted
3. Creates a reasonable schedule (not too many 8am classes)

Return ONLY valid JSON in exactly this format, no markdown, no explanation:
{
  "selections": [
    {
      "courseId": "EECS 281",
      "sectionType": "LEC",
      "sectionNumber": "001",
      "instructor": "Smith, John",
      "days": "TuTh",
      "times": "10:00AM - 11:30AM",
      "location": "1013 DOW"
    }
  ]
}

Include one entry per section type needed (LEC, LAB, DIS) for each course.
If a course only has LEC sections, include only LEC.

Course data:
${JSON.stringify(courseDataForGemini, null, 2)}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          response_mime_type: "application/json",
        },
      }),
    });

    if (!geminiResp.ok) {
      const err = await geminiResp.json();
      throw new Error(err.error?.message ?? "Gemini API error");
    }

    const geminiData = await geminiResp.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const selections = JSON.parse(rawText.replace(/```json|```/g, "").trim()) as {
      selections: {
        courseId: string;
        sectionType: string;
        sectionNumber: string;
        instructor: string;
        days: string;
        times: string;
        location: string;
      }[];
    };

    // Build final ScheduleOutput
    const termLabel = term === "2570" ? "Winter 2026" : term === "2610" ? "Fall 2026" : `Term ${term}`;
    let totalCredits = 0;

    const scheduledCourses: ScheduledCourse[] = [];
    let colorIdx = 0;

    for (const course of courses) {
      const courseSelections = selections.selections.filter(
        (s) => s.courseId === course.courseId
      );
      if (courseSelections.length === 0) continue;

      totalCredits += course.credits ?? 0;

      const sections: ScheduledSection[] = courseSelections.map((sel) => {
        const parsed = parseTimeRange(sel.times);
        const days = expandDays(sel.days);

        return {
          sectionType: sel.sectionType,
          sectionNumber: sel.sectionNumber,
          instructor: sel.instructor,
          meetings: parsed
            ? [
                {
                  days,
                  startTime: parsed.startTime,
                  endTime: parsed.endTime,
                  location: sel.location ?? "TBA",
                },
              ]
            : [],
        };
      });

      scheduledCourses.push({
        courseCode: course.courseId,
        title: course.title,
        credits: course.credits ?? 0,
        color: COURSE_COLORS[colorIdx % COURSE_COLORS.length],
        sections,
      });

      colorIdx++;
    }

    const schedule: ScheduleOutput = {
      term,
      termLabel,
      totalCredits,
      courses: scheduledCourses,
    };

    return NextResponse.json({ schedule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/schedule]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
