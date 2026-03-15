/**
 * app/api/plan/route.ts
 *
 * POST /api/plan
 *
 * Gemini-powered schedule planning endpoint with tool calling (function calling).
 * Uses the Gemini REST API directly — no SDK needed.
 *
 * Request body:
 *   {
 *     userId: string,          // Better Auth user ID
 *     message: string,         // The student's request
 *     history?: GeminiMessage[] // Prior conversation turns (for multi-turn)
 *   }
 *
 * Response:
 *   { reply: string }          // The assistant's final text response
 *
 * Environment variables needed:
 *   GEMINI_API_KEY=<your Google AI Studio key>
 *   DATABASE_URL=<your MongoDB Atlas connection string>
 */

import { NextRequest, NextResponse } from "next/server";
import { GEMINI_TOOLS, executeTool } from "@/lib/ai-tools";

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOOL_ROUNDS = 8; // Safety cap: max tool-call cycles per request

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: unknown;
  };
}

interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      role: string;
      parts: GeminiPart[];
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// ─── Gemini API Call ──────────────────────────────────────────────────────────

async function callGemini(messages: GeminiMessage[]): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: `You are GradAI, an expert academic planning assistant for University of Michigan students.
            
Your job is to help students plan their course schedules and degree progress. You have access to 
the UMich course catalog, program requirements, and student transcripts via tools.

Guidelines:
- Always start by fetching the student's profile and requirements before making recommendations
- Be specific: cite actual course codes, credit counts, and requirement block names
- Check for schedule conflicts when suggesting multiple courses for the same term
- Consider workload percent when recommending course loads (a full semester is typically 14-16 credits)
- If a prerequisite chain is incomplete, flag it clearly
- Format your final response in a clear, structured way using markdown
- Term code 2610 = Winter 2026 (the current/upcoming term)`,
          },
        ],
      },
      contents: messages,
      tools: GEMINI_TOOLS,
      tool_config: {
        function_calling_config: {
          mode: "AUTO", // Gemini decides when to call tools
        },
      },
      generation_config: {
        temperature: 0.4,   // Lower = more deterministic planning output
        max_output_tokens: 2048,
      },
    }),
  });

  const data = await response.json() as GeminiResponse;

  if (!response.ok || data.error) {
    throw new Error(
      `Gemini API error: ${data.error?.message ?? response.statusText}`
    );
  }

  return data;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId: string;
      message: string;
      history?: GeminiMessage[];
    };

    const { userId, message, history = [] } = body;

    if (!userId || !message) {
      return NextResponse.json(
        { error: "userId and message are required" },
        { status: 400 }
      );
    }

    // Build the conversation: prior history + new user message
    const messages: GeminiMessage[] = [
      ...history,
      {
        role: "user",
        parts: [
          {
            text:
              `[Student User ID: ${userId}]\n\n${message}`,
          },
        ],
      },
    ];

    // ── Agentic tool-calling loop ──────────────────────────────────────────
    // Gemini may request multiple tool calls before producing a final text reply.
    // We keep looping until it returns a text response (finishReason: "STOP")
    // or we hit the safety cap.

    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const geminiResponse = await callGemini(messages);
      const candidate = geminiResponse.candidates?.[0];

      if (!candidate) {
        throw new Error("No response candidate returned from Gemini.");
      }

      console.log("[GradAI] candidate:", JSON.stringify(candidate, null, 2));

      const { parts, role } = candidate.content;
      const finishReason = candidate.finishReason;

      // Add the model's response turn to history
      messages.push({ role: "model", parts });

      // Check if this turn contains any function calls
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0) {
        // No tool calls — extract the text reply and return it
        const textPart = parts.find((p) => p.text);
        const reply = textPart?.text ?? "I wasn't able to generate a response. Please try again.";
        return NextResponse.json({ reply });
      }

      // Execute all requested tool calls in parallel
      const toolResults = await Promise.all(
        functionCalls.map(async (part) => {
          const { name, args } = part.functionCall!;
          console.log(`[GradAI] Calling tool: ${name}`, args);

          let result: unknown;
          try {
            result = await executeTool(name, args);
          } catch (err) {
            result = {
              error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            };
          }

          return {
            functionResponse: {
              name,
              response: result,
            },
          } satisfies GeminiPart;
        })
      );

      // Send tool results back to Gemini as a "user" turn
      // (Gemini expects function responses in the user role)
      messages.push({
        role: "user",
        parts: toolResults,
      });
    }

    // Safety cap hit — return whatever partial response we have
    const lastModelTurn = [...messages].reverse().find((m) => m.role === "model");
    const fallbackText = lastModelTurn?.parts.find((p) => p.text)?.text;

    return NextResponse.json({
      reply:
        fallbackText ??
        "I'm having trouble completing this request. Please try with a more specific question.",
    });
  } catch (error) {
    console.error("[GradAI /api/plan error]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
