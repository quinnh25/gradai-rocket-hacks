/**
 * app/api/chats/[id]/route.ts
 *
 * GET    /api/chats/[id]   — fetch full chat with messages
 * PUT    /api/chats/[id]   — update messages + title
 * DELETE /api/chats/[id]   — delete a chat
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
    const chat = await db
      .collection("chats")
      .findOne({ _id: new ObjectId(id) });

    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    return NextResponse.json({
      id: chat._id.toString(),
      title: chat.title,
      messages: chat.messages ?? [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { messages, title } = await req.json() as {
      messages: { role: string; content: string }[];
      title?: string;
    };

    const db = await getDb();
    await db.collection("chats").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          messages,
          messageCount: messages.length,
          updatedAt: new Date(),
          ...(title ? { title } : {}),
        },
      }
    );

    return NextResponse.json({ success: true });
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
    await db.collection("chats").deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
