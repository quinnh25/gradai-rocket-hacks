/**
 * app/api/schedules/route.ts
 *
 * GET  /api/schedules?userId=xxx  — list all saved schedules
 * POST /api/schedules             — save a new schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

let _client: MongoClient | null = null;
async function getDb() {
  if (!_client) {
    _client = new MongoClient(process.env.DATABASE_URL!);
    await _client.connect();
  }
  return _client.db();
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const db = await getDb();
    const schedules = await db
      .collection("schedules")
      .find({ userId })
      .sort({ createdAt: -1 })
      .project({ _id: 1, title: 1, termLabel: 1, totalCredits: 1, createdAt: 1 })
      .toArray();

    return NextResponse.json({
      schedules: schedules.map((s) => ({
        id: s._id.toString(),
        title: s.title,
        termLabel: s.termLabel,
        totalCredits: s.totalCredits,
        createdAt: s.createdAt,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, schedule } = await req.json() as {
      userId: string;
      schedule: {
        term: string;
        termLabel: string;
        totalCredits: number;
        courses: unknown[];
      };
    };

    if (!userId || !schedule) return NextResponse.json({ error: "userId and schedule required" }, { status: 400 });

    const db = await getDb();

    // Auto-title: "Fall 2026 — 16 credits"
    const title = `${schedule.termLabel} — ${schedule.totalCredits} credits`;

    const result = await db.collection("schedules").insertOne({
      userId,
      title,
      termLabel: schedule.termLabel,
      totalCredits: schedule.totalCredits,
      schedule,
      createdAt: new Date(),
    });

    return NextResponse.json({ id: result.insertedId.toString(), title });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
