/**
 * app/api/parse-transcript/route.ts
 *
 * POST /api/parse-transcript
 *
 * 1. Sends the PDF to Gemini for parsing
 * 2. Looks up real credit counts from the courses collection
 * 3. Saves the parsed courses to the student's MongoDB profile
 * 4. Returns the parsed courses to the client
 *
 * Request body:
 *   { pdfBase64: string, userId: string }
 *
 * Response:
 *   { courses: { subject: string, number: string, semester: string }[], saved: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { MongoClient, Db } from "mongodb";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

let _client: MongoClient | null = null;
async function getDb(): Promise<Db> {
  if (!_client) {
    _client = new MongoClient(process.env.DATABASE_URL!);
    await _client.connect();
  }
  return _client.db();
}

interface ParsedCourse {
  subject: string;
  number: string;
  semester: string;
}

// Look up real credit counts from the courses collection using courseId field
async function toTranscriptEntries(courses: ParsedCourse[], db: Db) {
  const courseCodes = courses.map((c) => `${c.subject} ${c.number}`);

  const courseDocs = await db
    .collection("courses")
    .find({ courseId: { $in: courseCodes } })  // ← courseId matches Prisma schema
    .project({ courseId: 1, credits: 1 })
    .toArray();

  const creditMap: Record<string, number> = {};
  for (const doc of courseDocs) {
    creditMap[doc.courseId] = doc.credits;  // ← courseId matches Prisma schema
  }

  return courses.map((c) => ({
    course_code: `${c.subject} ${c.number}`,
    credits: creditMap[`${c.subject} ${c.number}`] ?? 0,
    grade: "N/A",
    term: c.semester,
  }));
}

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64, userId } = await req.json() as {
      pdfBase64: string;
      userId: string;
    };

    if (!pdfBase64) {
      return NextResponse.json({ error: "pdfBase64 is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    // ── 1. Parse transcript with Gemini ───────────────────────────────────────
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
              {
                text: `Extract every course from this transcript. Return ONLY valid JSON — no markdown, no explanation:
{"courses":[{"subject":"EECS","number":"280","semester":"Fall 2023"}]}
Rules:
- subject = department code exactly as shown (e.g. "EECS", "MATH", "PHYSICS")
- number = course number as a string (e.g. "280", "115", "101X")
- semester = term + year exactly (e.g. "Fall 2023", "Winter 2024")
- Include ALL courses: transfer credit, AP credit, current enrollments, completed courses
- For transfer/AP/IB credit, use semester = "Transfer Credit"
- Do not include duplicates`,
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

    if (!geminiRes.ok) {
      const err = await geminiRes.json();
      throw new Error(err.error?.message ?? `Gemini API error ${geminiRes.status}`);
    }

    const data = await geminiRes.json();
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!raw) throw new Error("Empty response from Gemini");

    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      courses: ParsedCourse[];
    };

    // ── 2. Save to MongoDB if userId provided ─────────────────────────────────
    let saved = false;
    if (userId) {
      try {
        const db = await getDb();
        // Look up real credits from courses collection
        const transcriptEntries = await toTranscriptEntries(parsed.courses, db);

        await db.collection("students").updateOne(
          { userId },
          {
            $set: {
              userId,
              transcript: transcriptEntries,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              enrolledPrograms: [],
              preferences: {},
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );

        saved = true;
        console.log(
          `[parse-transcript] Saved ${transcriptEntries.length} courses for user ${userId}`
        );
      } catch (dbErr) {
        console.error("[parse-transcript] DB save failed:", dbErr);
      }
    }

    return NextResponse.json({ courses: parsed.courses, saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/parse-transcript]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}