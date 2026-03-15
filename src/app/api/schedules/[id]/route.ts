/**
 * app/api/schedules/[id]/route.ts
 *
 * GET    /api/schedules/[id]  — fetch full schedule data
 * DELETE /api/schedules/[id]  — delete a schedule
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();
    const doc = await db.collection("schedules").findOne({ _id: new ObjectId(id) });
    if (!doc) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    return NextResponse.json({ id: doc._id.toString(), title: doc.title, schedule: doc.schedule });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();
    await db.collection("schedules").deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
