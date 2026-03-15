/**
 * app/api/plan/route.ts
 *
 * POST /api/plan
 *
 * Gemini-powered academic planning endpoint with tool calling.
 * When the student asks for a single-semester schedule, Gemini calls
 * the build_schedule tool which runs the backtracking scheduler and
 * returns a ScheduleOutput that gets sent to the weekly calendar panel.
 *
 * Request body:
 *   { userId: string, message: string, history?: GeminiMessage[] }
 *
 * Response:
 *   { reply: string, schedule?: ScheduleOutput }
 */

import { NextRequest, NextResponse } from "next/server";
import { GEMINI_TOOLS, executeTool } from "@/lib/ai-tools";

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOOL_ROUNDS = 20;

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

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are GradAI, an expert academic planning assistant for University of Michigan students.

Your job is to help students plan their course schedules and degree progress. You have access to 
the UMich course catalog, program requirements, student transcripts, and a schedule builder via tools.

Core guidelines:
- Always fetch the student profile first before making recommendations
- Be specific: cite actual course codes, credit counts, and requirement block names  
- Consider workload percent when recommending course loads (14-16 credits is typical)
- Term code 2570 = Winter 2026, Term code 2610 = Fall 2026

━━━ SCHEDULE BUILDING (single semester) ━━━

When a student asks for their schedule for a specific upcoming semester:

Step 1 — Call get_student_profile to understand their completed courses and enrolled programs.

Step 2 — If the student hasn't mentioned preferences, ask them ONE time:
  "Before I build your schedule, do you have any preferences?
   - Avoid early morning classes (before 10am)?
   - Keep Fridays free?
   - Target credit hours? (default: 15)
   - Maximum workload per course? (default: no limit)"
  
  If they say "no preferences" or "just build it" or similar, proceed with defaults immediately.

Step 3 — Call build_schedule with the appropriate parameters.

━━━ MODIFYING AN EXISTING SCHEDULE ━━━

If the student already has a schedule (you can see a previous build_schedule call in the 
conversation history) and asks to modify it, you MUST follow these rules:

RULE 1 — NEVER rebuild from scratch. Always preserve what exists.

RULE 2 — Extract ALL course codes from the most recent build_schedule result in the 
conversation and pass them as pinned_courses. This locks those courses in place.

RULE 3 — Apply only the specific change requested:
  - "move TCHNCLCM 300 off Friday"
    → pinned_courses: [all current courses including TCHNCLCM 300]
    → excluded_days_for_courses: { "TCHNCLCM 300": ["Fr"] }
  
  - "remove PHYSICS 240 from the schedule"
    → pinned_courses: [all current courses EXCEPT PHYSICS 240]
  
  - "add a LING class" or "include a linguistics course"
    → First call search_courses with department: "LING" to find an available course code
    → Then call build_schedule with:
       pinned_courses: [all current courses]
       required_courses: ["LING 111"] (or whichever code you found)
       Adjust target_credits up to accommodate the new course
  
  - "swap out EECS 376 for something else"
    → pinned_courses: [all current courses EXCEPT EECS 376]
    → Gemini will fill the credit gap with the next best option

RULE 4 — CREDIT HOURS: 
  If the student specifies a range (e.g. "between 15 and 17 credits"), set target_credits 
  to the midpoint (16). Never let retries cause the total to drift outside that range.
  The pinned_courses credits count toward the total — set target_credits accordingly.

RULE 5 — SPECIFIC COURSE REQUESTS:
  If the student asks for a specific department or course type (e.g. "a LING class", 
  "a writing course", "MATH 217"), always call search_courses FIRST to find the exact 
  course code before calling build_schedule. Never guess course codes.

━━━ GRADUATION PLANNING (multi-semester) ━━━

When a student asks about remaining semesters or graduation timeline:
- Use get_student_profile and check_requirements first
- Use get_program_requirements to understand remaining courses
- Verify availability using get_course where possible
- Output a gradplan-json block after your explanation in this exact format:

\`\`\`gradplan-json
{
  "expectedGraduation": "Winter 2028",
  "totalCreditsRemaining": 88,
  "semesters": [
    {
      "label": "Fall 2026",
      "totalCredits": 16,
      "courses": [
        {
          "code": "EECS 281",
          "credits": 4,
          "requirement": "CS Program Core",
          "notes": "Prereq: EECS 280 ✅"
        }
      ]
    }
  ]
}
\`\`\`

━━━ ALL OTHER RESPONSES ━━━

Use normal markdown. No JSON blocks needed.`;

// ─── Gemini API Call ──────────────────────────────────────────────────────────

async function callGemini(messages: GeminiMessage[]): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment variables.");

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: messages,
      tools: GEMINI_TOOLS,
      tool_config: {
        function_calling_config: { mode: "AUTO" },
      },
      generation_config: {
        temperature: 0.4,
        max_output_tokens: 8192,
      },
    }),
  });

  const data = await response.json() as GeminiResponse;
  if (!response.ok || data.error) {
    throw new Error(`Gemini API error: ${data.error?.message ?? response.statusText}`);
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

    const messages: GeminiMessage[] = [
      ...history,
      {
        role: "user",
        parts: [{ text: `[Student User ID: ${userId}]\n\n${message}` }],
      },
    ];

    // ── Agentic tool-calling loop ─────────────────────────────────────────────
    let rounds = 0;
    let scheduleData: unknown = null;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      console.log(`[GradAI] Round ${rounds}/${MAX_TOOL_ROUNDS}`);

      const geminiResponse = await callGemini(messages);
      const candidate = geminiResponse.candidates?.[0];

      if (!candidate) throw new Error("No response candidate returned from Gemini.");

      const { parts } = candidate.content;
      messages.push({ role: "model", parts });

      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0) {
        // No tool calls — extract text and return
        const textPart = parts.find((p) => p.text);
        const reply = textPart?.text ?? "I wasn't able to generate a response. Please try again.";
        return NextResponse.json({
          reply,
          ...(scheduleData ? { schedule: scheduleData } : {}),
        });
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        functionCalls.map(async (part) => {
          const { name, args } = part.functionCall!;
          console.log(`[GradAI] Calling tool: ${name}`, JSON.stringify(args).slice(0, 200));

          let result: unknown;
          try {
            result = await executeTool(name, args);

            // Capture schedule if build_schedule was called successfully
            if (
              name === "build_schedule" &&
              typeof result === "object" &&
              result !== null &&
              "schedule" in result &&
              (result as { success?: boolean }).success
            ) {
              scheduleData = (result as { schedule: unknown }).schedule;
            }
          } catch (err) {
            result = {
              error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            };
          }

          return {
            functionResponse: { name, response: result },
          } satisfies GeminiPart;
        })
      );

      // Send tool results back to Gemini
      messages.push({ role: "user", parts: toolResults });
    }

    // Safety cap hit
    const lastModelTurn = [...messages].reverse().find((m) => m.role === "model");
    const fallbackText = lastModelTurn?.parts.find((p) => p.text)?.text;

    return NextResponse.json({
      reply: fallbackText ?? "I'm having trouble completing this request. Please try with a more specific question.",
      ...(scheduleData ? { schedule: scheduleData } : {}),
    });
  } catch (error) {
    console.error("[GradAI /api/plan error]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}