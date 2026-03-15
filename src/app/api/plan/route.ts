/**
 * app/api/plan/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { GEMINI_TOOLS, executeTool } from "@/lib/ai-tools";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOOL_ROUNDS = 20;

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content: { role: string; parts: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { code: number; message: string; status: string };
}

const SYSTEM_PROMPT = `You are GradAI, an expert academic planning assistant for University of Michigan students.

You have access to the UMich course catalog, program requirements, student transcripts, and a schedule builder via tools.

Core guidelines:
- Always fetch the student profile first before making recommendations
- Be specific: cite actual course codes, credit counts, and requirement block names
- Term code 2570 = Winter 2026, Term code 2610 = Fall 2026

━━━ PROGRAM NAME RULE (CRITICAL) ━━━

You MUST pass program_name to build_schedule on EVERY call without exception — including 
modifications. Never omit it. If the student said "Computer Science" or "CS Engineering" 
or similar, always pass "Computer Science Engineering" as program_name.

━━━ SCHEDULE BUILDING (single semester) ━━━

When a student asks for a schedule:

Step 1 — Call get_student_profile.

Step 2 — If no preferences mentioned, ask ONCE:
  "Before I build your schedule, any preferences?
   - Avoid early mornings (before 10am)?
   - Keep Fridays free?
   - Target credit hours? (default: 15)
   - Max workload per course?"
  If they say "just build it" or similar, use defaults immediately.

Step 3 — Call build_schedule with:
  - user_id, term, program_name (ALWAYS required)
  - target_credits, avoid_mornings, free_fridays as specified

━━━ MODIFYING AN EXISTING SCHEDULE ━━━

When the student asks to change a schedule, you MUST:

1. ALWAYS include program_name (same as the original build).
2. Extract ALL course codes from the most recent schedule in conversation history.
3. Pass them as pinned_courses to keep the schedule intact.
4. Apply only the specific change:

   "move EECS 281 lab off Friday"
   → pinned_courses: [all current courses]
   → excluded_days_for_courses: '{"EECS 281": ["Fr"]}'

   "remove PHYSICS 240, add a LING class"
   → Call search_courses with department "LING" first to find a code
   → pinned_courses: [all courses EXCEPT PHYSICS 240]
   → required_courses: ["LING 209"] (or whatever you found)

   "swap out EECS 376"
   → pinned_courses: [all courses EXCEPT EECS 376]

   "keep Mondays free" / "no classes before 9am" / toggle any preference
   → pinned_courses: [ALL current courses]
   → Update the relevant preference flag (avoid_mornings, free_fridays)
   → Keep target_credits the same as current schedule

5. NEVER rebuild from scratch. NEVER omit pinned_courses when modifying.
6. If build_schedule returns a program-not-found error, retry with a slightly 
   different program_name spelling (e.g. "Computer Science" vs "Computer Science Engineering").

━━━ CREDIT HOURS ━━━

If the student gives a range (e.g. "15 to 17 credits"), use the midpoint (16).
When modifying, compute target_credits as the sum of pinned_courses credits 
plus any new required_courses credits.

━━━ ADDING A SPECIFIC DEPARTMENT/COURSE ━━━

If the student says "add a LING class" or "I want a writing course":
1. Call search_courses with the relevant department first.
2. Pick the best available option.
3. Pass it in required_courses.
Never guess course codes.

━━━ GRADUATION PLANNING ━━━

When a student asks about graduation timeline or remaining semesters:
1. Call get_student_profile
2. Call check_requirements
3. Call get_program_requirements if needed
4. Write a clear explanation in markdown
5. ALWAYS end with a gradplan-json block in EXACTLY this format — no extra fields, no deviations:

\`\`\`gradplan-json
{
  "expectedGraduation": "Winter 2028",
  "totalCreditsRemaining": 48,
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

The gradplan-json block is MANDATORY for any graduation planning response.
Do not skip it. Do not add extra fields. Do not use a different tag name.

━━━ ALL OTHER RESPONSES ━━━

Use normal markdown. No JSON blocks needed.`;

async function callGemini(messages: GeminiMessage[]): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages,
      tools: GEMINI_TOOLS,
      tool_config: { function_calling_config: { mode: "AUTO" } },
      generation_config: { temperature: 0.4, max_output_tokens: 8192 },
    }),
  });

  const data = await response.json() as GeminiResponse;
  if (!response.ok || data.error) {
    throw new Error(`Gemini API error: ${data.error?.message ?? response.statusText}`);
  }
  return data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId: string;
      message: string;
      history?: GeminiMessage[];
    };

    const { userId, message, history = [] } = body;
    if (!userId || !message) {
      return NextResponse.json({ error: "userId and message are required" }, { status: 400 });
    }

    const messages: GeminiMessage[] = [
      ...history,
      { role: "user", parts: [{ text: `[Student User ID: ${userId}]\n\n${message}` }] },
    ];

    let rounds = 0;
    let scheduleData: unknown = null;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      console.log(`[GradAI] Round ${rounds}/${MAX_TOOL_ROUNDS}`);

      const geminiResponse = await callGemini(messages);
      const candidate = geminiResponse.candidates?.[0];
      if (!candidate) throw new Error("No response candidate from Gemini.");

      const { parts } = candidate.content;
      messages.push({ role: "model", parts });

      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0) {
        const textPart = parts.find((p) => p.text);
        const reply = textPart?.text ?? "I wasn't able to generate a response. Please try again.";
        return NextResponse.json({
          reply,
          ...(scheduleData ? { schedule: scheduleData } : {}),
        });
      }

      const toolResults = await Promise.all(
        functionCalls.map(async (part) => {
          const { name, args } = part.functionCall!;
          console.log(`[GradAI] Tool: ${name}`, JSON.stringify(args).slice(0, 200));

          let result: unknown;
          try {
            result = await executeTool(name, args);
            if (
              name === "build_schedule" &&
              typeof result === "object" && result !== null &&
              "schedule" in result &&
              (result as { success?: boolean }).success
            ) {
              scheduleData = (result as { schedule: unknown }).schedule;
            }
          } catch (err) {
            result = { error: `Tool failed: ${err instanceof Error ? err.message : String(err)}` };
          }

          return { functionResponse: { name, response: result } } satisfies GeminiPart;
        })
      );

      messages.push({ role: "user", parts: toolResults });
    }

    const lastModel = [...messages].reverse().find((m) => m.role === "model");
    const fallback = lastModel?.parts.find((p) => p.text)?.text;

    return NextResponse.json({
      reply: fallback ?? "I'm having trouble completing this. Please try again.",
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