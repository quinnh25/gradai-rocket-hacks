/**
 * app/api/student/route.ts
 *
 * GET  /api/student?userId=xxx   — fetch student profile + transcript
 * POST /api/student              — update enrolled programs
 *
 * POST body:
 *   { userId: string, enrolledPrograms: string[] }  // program _id strings
 */

import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

let _client: MongoClient | null = null;
async function getDb() {
  if (!_client) {
    _client = new MongoClient(process.env.DATABASE_URL!);
    await _client.connect();
  }
  return _client.db();
}

// ── GET /api/student?userId=xxx ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const db = await getDb();
    const student = await db.collection("students").findOne({ userId });

    if (!student) {
      // Return empty profile shape — student hasn't uploaded transcript yet
      return NextResponse.json({
        exists: false,
        userId,
        transcript: [],
        enrolledPrograms: [],
        preferences: {},
      });
    }

    // Hydrate program names
    const programIds = (student.enrolledPrograms ?? []).map(
      (id: string) => new ObjectId(id)
    );
    const programs =
      programIds.length > 0
        ? await db
            .collection("programs")
            .find(
              { _id: { $in: programIds } },
              { projection: { program_name: 1, program_type: 1, college: 1 } }
            )
            .toArray()
        : [];

    return NextResponse.json({
      exists: true,
      userId: student.userId,
      transcript: student.transcript ?? [],
      enrolledPrograms: programs.map((p) => ({
        id: p._id.toString(),
        program_name: p.program_name,
        program_type: p.program_type,
        college: p.college,
      })),
      preferences: student.preferences ?? {},
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/student]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST /api/student — update enrolled programs ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { userId, enrolledPrograms } = await req.json() as {
      userId: string;
      enrolledPrograms: string[];
    };

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const db = await getDb();
    await db.collection("students").updateOne(
      { userId },
      {
        $set: {
          enrolledPrograms: enrolledPrograms ?? [],
          updatedAt: new Date(),
        },
        $setOnInsert: {
          transcript: [],
          preferences: {},
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/student]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
