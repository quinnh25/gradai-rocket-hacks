/**
 * app/api/parse-transcript/route.ts
 *
 * POST /api/parse-transcript
 *
 * Proxies the transcript PDF to Gemini on the server so the API key
 * is never exposed to the browser.
 *
 * Request body:
 *   { pdfBase64: string }   // base64-encoded PDF (no data-URL prefix)
 *
 * Response:
 *   { courses: { subject: string, number: string, semester: string }[] }
 */

import { NextRequest, NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64 } = await req.json() as { pdfBase64: string };

    if (!pdfBase64) {
      return NextResponse.json({ error: "pdfBase64 is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

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
{"courses":[{"subject":"CS","number":"101","semester":"Fall 2023"}]}
Rules: subject = dept code (e.g. "EECS"), number = course number as string, semester = term + year. Include transfer/AP credit and current enrollments. For any transfer/AP/IB credit, make a separate semester that is simply called Transfer Credit`,
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

    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/parse-transcript]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
