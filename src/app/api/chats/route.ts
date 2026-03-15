/**
 * app/api/chats/route.ts
 *
 * GET  /api/chats?userId=xxx        — list all chats for a user
 * POST /api/chats                   — create a new chat
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

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const db = await getDb();
    const chats = await db
      .collection("chats")
      .find({ userId })
      .sort({ updatedAt: -1 })
      .project({ _id: 1, title: 1, createdAt: 1, updatedAt: 1, messageCount: 1 })
      .toArray();

    return NextResponse.json({
      chats: chats.map((c) => ({
        id: c._id.toString(),
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c.messageCount ?? 0,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, title, messages } = await req.json() as {
      userId: string;
      title: string;
      messages: { role: string; content: string }[];
    };

    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const db = await getDb();
    const result = await db.collection("chats").insertOne({
      userId,
      title: title || "New Chat",
      messages: messages ?? [],
      messageCount: messages?.length ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ id: result.insertedId.toString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
