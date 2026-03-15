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
- IMPORTANT: Before recommending a course for a specific semester, ALWAYS call get_course to verify 
  it is available in the correct term. Term codes are: Fall 2026 = 2610, Winter 2026 = 2570.
  A course is only available in a term if its term field matches AND it has open or waitlisted sections.
  If a course is not available in the target term, find an alternative or recommend it for a different semester.
- Check for schedule conflicts when suggesting multiple courses for the same term
- Consider workload percent when recommending course loads (a full semester is typically 14-16 credits)
- If a prerequisite chain is incomplete, flag it clearly
- Term code 2570 = Winter 2026, Term code 2610 = Fall 2026

OUTPUT FORMAT RULES — follow these exactly:

1. When generating a SINGLE SEMESTER schedule (user asks about one specific term):
   After your explanation text, append a JSON block in this exact format:
   \`\`\`schedule-json
   {
     "term": "2570",
     "termLabel": "Winter 2026",
     "totalCredits": 16,
     "courses": [
       {
         "courseCode": "EECS 281",
         "title": "Data Structures and Algorithms",
         "credits": 4,
         "color": "#3B82F6",
         "sections": [
           {
             "sectionType": "LEC",
             "sectionNumber": "001",
             "instructor": "Smith, John",
             "meetings": [
               {
                 "days": ["Tu", "Th"],
                 "startTime": "10:00",
                 "endTime": "11:30",
                 "location": "1013 DOW"
               }
             ]
           }
         ]
       }
     ]
   }
   \`\`\`
   Use these colors in order: #3B82F6, #10B981, #F59E0B, #8B5CF6, #EF4444, #06B6D4, #F97316, #6366F1
   Get real section times from get_course tool. Use 24hr time format for startTime/endTime.
   days must be an array of 2-letter codes: "Mo", "Tu", "We", "Th", "Fr"

2. When generating a MULTI-SEMESTER plan (user asks about remaining semesters or graduation plan):
   Use markdown tables, one per semester. Do NOT include schedule-json blocks.
   Format each semester as:
   ### Fall 2026
   | Course | Credits | Requirement | Notes |
   |--------|---------|-------------|-------|
   | EECS 281 | 4 | CS Program Core | Prereq: EECS 280 ✅ |

3. For all other responses: use normal markdown.`,},
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
        max_output_tokens: 32000,
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
