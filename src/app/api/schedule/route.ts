/**
 * app/api/schedule/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

export interface ScheduledMeeting {
  days: string[];
  startTime: string;
  endTime: string;
  location: string;
}

export interface ScheduledSection {
  sectionType: string;
  sectionNumber: string;
  instructor: string;
  meetings: ScheduledMeeting[];
}

export interface ScheduledCourse {
  courseCode: string;
  title: string;
  credits: number;
  color: string;
  sections: ScheduledSection[];
}

export interface ScheduleOutput {
  term: string;
  termLabel: string;
  totalCredits: number;
  courses: ScheduledCourse[];
}

interface TimeBlock {
  label: string;
  days: Set<string>;
  startMin: number;
  endMin: number;
  courseCode?: string;
}

interface SectionCombo {
  lecture: RawSection;
  linked: RawSection[];
}

interface RawSection {
  SectionNumber: string | number;
  SectionType: string;
  Instructors?: string[];
  Meetings?: RawMeeting[];
  Status?: string;
  EnrollmentStatus?: string;
  AvailableSeats?: number;
}

interface RawMeeting {
  days?: string;
  Days?: string;
  times?: string;
  Times?: string;
  location?: string;
  Location?: string;
}

interface RequirementBlock {
  blockName?: string;
  block_name?: string;
  creditsRequired?: number;
  credits_required_for_block?: number;
  coursesRequired?: number;
  courses_required_for_block?: number;
  mandatoryCourses?: string[];
  mandatory_courses?: string[];
  electiveOptions?: string[];
  elective_options?: string[];
  rules?: string;
}

interface ScoredBlock {
  blockName: string;
  urgency: number;
  creditsRequired: number;
  mandatory: string[];
  electives: string[];
}

interface CourseToSchedule {
  code: string;
  title: string;
  credits: number;
  workload: string;
  combos: SectionCombo[];
}

interface ScheduleEntry {
  code: string;
  title: string;
  credits: number;
  workload: string;
  lecture: RawSection;
  linked: RawSection[];
  timeBlocks: TimeBlock[];
}

// ─── MongoDB ──────────────────────────────────────────────────────────────────

let _client: MongoClient | null = null;
async function getDb() {
  if (!_client) {
    _client = new MongoClient(process.env.DATABASE_URL!);
    await _client.connect();
  }
  return _client.db();
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COURSE_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EF4444", "#06B6D4", "#F97316", "#6366F1",
];

const TERM_LABELS: Record<string, string> = {
  "2570": "Winter 2026",
  "2610": "Fall 2026",
};

const MAX_RETRY_ROUNDS = 6;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ─── Time Utilities ───────────────────────────────────────────────────────────

const DAY_EXPAND: Record<string, string[]> = {
  Mo: ["Mo"], Tu: ["Tu"], We: ["We"], Th: ["Th"], Fr: ["Fr"],
  MoWe: ["Mo", "We"],
  TuTh: ["Tu", "Th"],
  MoWeFr: ["Mo", "We", "Fr"],
  MoTuWeTh: ["Mo", "Tu", "We", "Th"],
};

function expandDays(daysStr: string): string[] {
  if (!daysStr || daysStr === "TBA") return [];
  if (DAY_EXPAND[daysStr]) return DAY_EXPAND[daysStr];
  const chunks = daysStr.match(/.{1,2}/g) ?? [];
  return chunks.filter((d) => ["Mo", "Tu", "We", "Th", "Fr", "Sa"].includes(d));
}

function parseTimeToMinutes(timeStr: string): { start: number; end: number } | null {
  const m = timeStr.match(/(\d+):(\d+)(AM|PM)\s*-\s*(\d+):(\d+)(AM|PM)/i);
  if (!m) return null;
  let sh = parseInt(m[1]), sm = parseInt(m[2]);
  let eh = parseInt(m[4]), em = parseInt(m[5]);
  if (m[3].toUpperCase() === "PM" && sh !== 12) sh += 12;
  if (m[3].toUpperCase() === "AM" && sh === 12) sh = 0;
  if (m[6].toUpperCase() === "PM" && eh !== 12) eh += 12;
  if (m[6].toUpperCase() === "AM" && eh === 12) eh = 0;
  return { start: sh * 60 + sm, end: eh * 60 + em };
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function blocksOverlap(a: TimeBlock, b: TimeBlock, courseCode?: string): boolean {
  if (a.courseCode && a.courseCode !== courseCode) return false;
  if (b.courseCode && b.courseCode !== courseCode) return false;
  const sharedDays = [...a.days].some((d) => b.days.has(d));
  if (!sharedDays) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function sectionToTimeBlocks(section: RawSection, label: string): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  for (const m of section.Meetings ?? []) {
    const daysStr = m.Days ?? m.days ?? "";
    const timesStr = m.Times ?? m.times ?? "";
    const days = expandDays(daysStr);
    const parsed = timesStr ? parseTimeToMinutes(timesStr) : null;
    if (days.length > 0 && parsed) {
      blocks.push({ label, days: new Set(days), startMin: parsed.start, endMin: parsed.end });
    }
  }
  return blocks;
}

function buildPreferenceBlocks(
  prefs: { avoidMornings?: boolean; freeFridays?: boolean },
  excludedDaysForCourses: Record<string, string[]>
): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  const weekdays = new Set(["Mo", "Tu", "We", "Th", "Fr"]);

  if (prefs.avoidMornings) {
    blocks.push({ label: "[PREF] No mornings", days: weekdays, startMin: 0, endMin: 10 * 60 });
  }

  if (prefs.freeFridays) {
    blocks.push({ label: "[PREF] Free Fridays", days: new Set(["Fr"]), startMin: 0, endMin: 24 * 60 });
  }

  for (const [courseCode, days] of Object.entries(excludedDaysForCourses)) {
    for (const day of days) {
      blocks.push({
        label: `[PREF] ${courseCode} not on ${day}`,
        days: new Set([day]),
        startMin: 0,
        endMin: 24 * 60,
        courseCode,
      });
    }
  }

  return blocks;
}

// ─── Section Grouping ─────────────────────────────────────────────────────────

function groupSectionsByFamily(sections: RawSection[]): SectionCombo[] {
  const open = sections.filter(
    (s) => s.Status === "Open" || s.EnrollmentStatus === "open"
  );
  const lectures = open.filter((s) => s.SectionType === "LEC");
  const linked = open.filter((s) => s.SectionType !== "LEC");

  if (lectures.length === 0) {
    if (open.length > 0) return [{ lecture: open[0], linked: [] }];
    return [];
  }

  function padded(s: RawSection): string {
    return String(s.SectionNumber ?? "000").padStart(3, "0");
  }

  const lecByNum: Record<string, RawSection> = {};
  const lecLinked: Record<string, RawSection[]> = {};
  for (const lec of lectures) {
    const k = padded(lec);
    lecByNum[k] = lec;
    lecLinked[k] = [];
  }

  for (const s of linked) {
    const sPad = padded(s);
    const sPrefix = sPad.slice(0, 2);
    let match = Object.keys(lecByNum).find((k) => k.slice(1) === sPrefix);
    if (!match) match = Object.keys(lecByNum).find((k) => k.slice(0, 2) === sPrefix);
    if (!match) {
      const sInt = parseInt(sPad);
      match = Object.keys(lecByNum).reduce((a, b) =>
        Math.abs(parseInt(a) - sInt) < Math.abs(parseInt(b) - sInt) ? a : b
      );
    }
    lecLinked[match].push(s);
  }

  return Object.keys(lecByNum).sort().map((k) => ({ lecture: lecByNum[k], linked: lecLinked[k] }));
}

function buildSectionCombos(family: SectionCombo): SectionCombo[] {
  if (family.linked.length === 0) return [{ lecture: family.lecture, linked: [] }];

  const byType: Record<string, RawSection[]> = {};
  for (const s of family.linked) {
    const t = s.SectionType ?? "OTHER";
    if (!byType[t]) byType[t] = [];
    byType[t].push(s);
  }

  const typeLists = Object.values(byType);
  let combos: RawSection[][] = [[]];
  for (const typeList of typeLists) {
    const newCombos: RawSection[][] = [];
    for (const existing of combos) {
      for (const s of typeList) newCombos.push([...existing, s]);
    }
    combos = newCombos;
  }

  return combos.map((linked) => ({ lecture: family.lecture, linked }));
}

// ─── Urgency Scoring ──────────────────────────────────────────────────────────

function scoreBlockUrgency(block: RequirementBlock, completed: Set<string>): number {
  const mandatory = (block.mandatoryCourses ?? block.mandatory_courses ?? []).filter(
    (c) => !completed.has(c)
  );
  const electives = (block.electiveOptions ?? block.elective_options ?? []).filter(
    (c) => !completed.has(c)
  );
  const total = mandatory.length + electives.length;
  if (total === 0) return 0;

  const mandatoryRatio = mandatory.length / total;
  const coursesRequired = block.coursesRequired ?? block.courses_required_for_block ?? 0;
  const choicePressure =
    coursesRequired > 0 ? Math.min(coursesRequired / total, 1.0) : electives.length === 0 ? 1.0 : 0.3;
  const completionGap = Math.min(mandatory.length / Math.max(total, 1), 1.0);

  return Math.round((mandatoryRatio * 0.5 + choicePressure * 0.3 + completionGap * 0.2) * 1000) / 1000;
}

function scoreAllBlocks(blocks: RequirementBlock[], completed: Set<string>): ScoredBlock[] {
  return blocks
    .map((b) => ({
      blockName: b.blockName ?? b.block_name ?? "Unknown",
      urgency: scoreBlockUrgency(b, completed),
      creditsRequired: b.creditsRequired ?? b.credits_required_for_block ?? 0,
      mandatory: (b.mandatoryCourses ?? b.mandatory_courses ?? []).filter((c) => !completed.has(c)),
      electives: (b.electiveOptions ?? b.elective_options ?? []).filter((c) => !completed.has(c)),
    }))
    .filter((b) => b.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency);
}

// ─── Gemini Course Selection ──────────────────────────────────────────────────

const SELECTION_SYSTEM = `You are an Academic Requirements Advisor for the University of Michigan.
Your ONLY job is to select which courses the student should take this term.
A separate algorithm handles time conflicts — ignore scheduling entirely.

PREREQUISITE RULE:
Every course has a "prereq_enforced" field. You MUST verify the student satisfies it.
Cross-reference against completed_courses. Courses selected THIS term do not count as completed.
If prereq_enforced is "N/A" or empty, select freely.

FORCED COURSES RULE:
The "forced_courses" list contains courses that MUST appear in your selections.
Include every course in forced_courses as long as it exists in candidate_courses and prereqs are satisfied.
If a forced course is shelved or unavailable, note it but do not fail.
Adjust other selections to hit target_credits AFTER locking in forced courses.
Do NOT replace or omit forced courses.

SELECTION PRIORITY:
1. forced_courses (always include if available)
2. mandatory courses from highest-urgency blocks
3. electives from highest-urgency blocks
4. breadth fillers to reach target_credits

OUTPUT: strictly valid JSON, no markdown, no explanation.
{
  "selections": [
    {
      "course_code": "EECS 281",
      "course_title": "Data Structures and Algorithms",
      "credits": 4,
      "workload_percent": 72,
      "requirement_block": "CS Program Core",
      "prereq_satisfied": true,
      "reasoning": "Mandatory core; prereqs EECS 280 and EECS 203 both completed."
    }
  ],
  "notes": "Optional caveats."
}`;

async function geminiSelectCourses(params: {
  completedCourses: string[];
  targetCredits: number;
  maxWorkload: number;
  majorName: string;
  scoredBlocks: ScoredBlock[];
  candidateCourses: Record<string, {
    title: string; credits: number; workload: string;
    prereq_enforced: string; prereq_advisory?: string;
  }>;
  shelved: string[];
  replaceCode?: string;
  previousSelections?: string[];
  forcedCourses?: string[];
}): Promise<{
  selections: {
    course_code: string; credits: number; workload_percent: number;
    course_title: string; requirement_block: string;
  }[];
  notes: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY!;

  const prompt = {
    task: "Select courses for this student following urgency-ranked blocks.",
    student: {
      major: params.majorName,
      completed_courses: params.completedCourses,
      target_credits: params.targetCredits,
      max_workload_per_class: params.maxWorkload,
    },
    forced_courses: params.forcedCourses ?? [],
    ranked_requirement_blocks: params.scoredBlocks.map((b) => ({
      block_name: b.blockName,
      urgency: b.urgency,
      credits_required: b.creditsRequired,
      mandatory_courses: b.mandatory,
      elective_options: b.electives.slice(0, 10),
    })),
    candidate_courses: params.candidateCourses,
    shelved_courses: params.shelved,
    ...(params.replaceCode ? {
      replace_course: params.replaceCode,
      instruction: `"${params.replaceCode}" has no valid sections. Replace it with an alternative. Do NOT remove any forced_courses.`,
    } : {}),
    ...(params.previousSelections?.length ? { avoid_these_exact_sets: params.previousSelections } : {}),
  };

  const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: JSON.stringify(prompt) }] }],
      system_instruction: { parts: [{ text: SELECTION_SYSTEM }] },
      generationConfig: { temperature: 0.1, response_mime_type: "application/json" },
    }),
  });

  const data = await resp.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ─── Backtracking Scheduler ───────────────────────────────────────────────────

function findValidSchedule(
  courses: CourseToSchedule[],
  prefBlocks: TimeBlock[]
): { success: true; schedule: ScheduleEntry[] } | { success: false; conflicts: string[] } {
  const occupied: TimeBlock[] = [...prefBlocks.filter((b) => !b.courseCode)];
  const chosen: ScheduleEntry[] = [];

  function firstConflict(newBlocks: TimeBlock[], courseCode: string): string | null {
    for (const nb of newBlocks) {
      for (const ob of occupied) {
        if (blocksOverlap(nb, ob, courseCode)) return `${nb.label} vs ${ob.label}`;
      }
      for (const pb of prefBlocks) {
        if (pb.courseCode === courseCode && blocksOverlap(nb, pb, courseCode)) {
          return `${nb.label} vs ${pb.label}`;
        }
      }
    }
    return null;
  }

  function backtrack(idx: number): boolean {
    if (idx === courses.length) return true;
    const course = courses[idx];

    for (const combo of course.combos) {
      const newBlocks: TimeBlock[] = [];
      for (const sec of [combo.lecture, ...combo.linked]) {
        newBlocks.push(...sectionToTimeBlocks(sec, course.code));
      }

      if (newBlocks.length === 0 && course.combos.length > 1) continue;
      if (firstConflict(newBlocks, course.code)) continue;

      occupied.push(...newBlocks);
      chosen.push({
        code: course.code, title: course.title, credits: course.credits,
        workload: course.workload, lecture: combo.lecture, linked: combo.linked,
        timeBlocks: newBlocks,
      });

      if (backtrack(idx + 1)) return true;

      occupied.splice(occupied.length - newBlocks.length, newBlocks.length);
      chosen.pop();
    }

    return false;
  }

  const success = backtrack(0);
  if (success) return { success: true, schedule: chosen };

  const globalPrefBlocks = prefBlocks.filter((b) => !b.courseCode);
  const stuck = courses
    .filter((course) => {
      const coursePrefBlocks = prefBlocks.filter((b) => b.courseCode === course.code);
      const allPrefBlocks = [...globalPrefBlocks, ...coursePrefBlocks];
      return !course.combos.some((combo) => {
        const blocks: TimeBlock[] = [];
        for (const sec of [combo.lecture, ...combo.linked]) {
          blocks.push(...sectionToTimeBlocks(sec, course.code));
        }
        return !allPrefBlocks.some((pb) => blocks.some((b) => blocksOverlap(b, pb, course.code)));
      });
    })
    .map((c) => c.code);

  return { success: false, conflicts: stuck.length > 0 ? stuck : courses.map((c) => c.code) };
}

// ─── Main Route Handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
      userId, term,
      targetCredits = 15,
      preferences = {},
      programName,
      pinnedCourses = [],
      requiredCourses = [],
      excludedDaysForCourses = {},
    } = await req.json() as {
      userId: string;
      term: string;
      targetCredits?: number;
      programName?: string;
      pinnedCourses?: string[];
      requiredCourses?: string[];
      excludedDaysForCourses?: Record<string, string[]>;
      preferences?: {
        avoidMornings?: boolean;
        freeFridays?: boolean;
        maxWorkloadPercent?: number;
      };
    };

    if (!userId || !term) {
      return NextResponse.json({ error: "userId and term required" }, { status: 400 });
    }

    const db = await getDb();
    const maxWorkload = preferences.maxWorkloadPercent ?? 100;

    // ── 1. Load student ───────────────────────────────────────────────────────
    const student = await db.collection("students").findOne({ userId });
    if (!student) {
      return NextResponse.json(
        { error: "Student profile not found. Please upload your transcript first." },
        { status: 404 }
      );
    }

    const completedCodes: string[] = (student.transcript ?? []).map(
      (c: { course_code: string }) => c.course_code
    );
    const completedSet = new Set(completedCodes);

    // ── 2. Load programs — with multiple fallbacks ────────────────────────────
    const programIds = (student.enrolledPrograms ?? []).map(
      (id: string) => new ObjectId(id)
    );

    let programs: { programName: string; requirementBlocks: RequirementBlock[] }[] = [];

    // Fallback 1: enrolled program IDs
    if (programIds.length > 0) {
      programs = await db
        .collection("programs")
        .find({ _id: { $in: programIds } })
        .toArray() as unknown as { programName: string; requirementBlocks: RequirementBlock[] }[];
    }

    // Fallback 2: exact programName match
    if (programs.length === 0 && programName) {
      programs = await db
        .collection("programs")
        .find({ programName: { $regex: programName, $options: "i" } })
        .toArray() as unknown as { programName: string; requirementBlocks: RequirementBlock[] }[];
    }

    // Fallback 3: try common aliases if still not found
    if (programs.length === 0 && programName) {
      const aliases: Record<string, string[]> = {
        "computer science": ["Computer Science Engineering", "Computer Science", "CS-Eng"],
        "cs": ["Computer Science Engineering", "Computer Science"],
        "eecs": ["Computer Science Engineering", "Electrical Engineering"],
        "electrical": ["Electrical Engineering", "Computer Science Engineering"],
        "mechanical": ["Mechanical Engineering"],
        "civil": ["Civil Engineering"],
        "chemical": ["Chemical Engineering"],
      };
      const lower = programName.toLowerCase();
      const tryNames = Object.entries(aliases)
        .filter(([key]) => lower.includes(key))
        .flatMap(([, vals]) => vals);

      for (const tryName of tryNames) {
        programs = await db
          .collection("programs")
          .find({ programName: { $regex: tryName, $options: "i" } })
          .toArray() as unknown as { programName: string; requirementBlocks: RequirementBlock[] }[];
        if (programs.length > 0) break;
      }
    }

    // Fallback 4: if pinned courses exist, find any program that contains them
    if (programs.length === 0 && pinnedCourses.length > 0) {
      programs = await db
        .collection("programs")
        .find({
          $or: [
            { "requirementBlocks.mandatoryCourses": { $in: pinnedCourses } },
            { "requirementBlocks.electiveOptions": { $in: pinnedCourses } },
          ],
        })
        .limit(1)
        .toArray() as unknown as { programName: string; requirementBlocks: RequirementBlock[] }[];
    }

    if (programs.length === 0) {
      return NextResponse.json({
        error:
          "No program found. Please tell me your major (e.g. 'Computer Science Engineering') so I can look up the requirements.",
      }, { status: 400 });
    }

    const allBlocks: RequirementBlock[] = programs.flatMap((p) => p.requirementBlocks ?? []);
    const majorName = programs.map((p) => p.programName).join(" + ");

    // ── 3. Score blocks ───────────────────────────────────────────────────────
    const scoredBlocks = scoreAllBlocks(allBlocks, completedSet);

    const neededCodes = new Set<string>();
    for (const block of scoredBlocks) {
      block.mandatory.forEach((c) => neededCodes.add(c));
      block.electives.forEach((c) => neededCodes.add(c));
    }
    pinnedCourses.forEach((c) => neededCodes.add(c));
    requiredCourses.forEach((c) => neededCodes.add(c));

    // ── 4. Load catalog ───────────────────────────────────────────────────────
    const catalogDocs = await db
      .collection("courses")
      .find({ courseId: { $in: [...neededCodes] }, term })
      .toArray();

    const catalogMap: Record<string, typeof catalogDocs[0]> = {};
    for (const doc of catalogDocs) catalogMap[doc.courseId] = doc;

    // ── 5. Build candidate courses ────────────────────────────────────────────
    const candidateCourses: Record<string, {
      title: string; credits: number; workload: string;
      prereq_enforced: string; prereq_advisory?: string;
    }> = {};

    for (const code of neededCodes) {
      const doc = catalogMap[code];
      if (!doc) continue;

      const isPinned = pinnedCourses.includes(code) || requiredCourses.includes(code);
      const wl = parseFloat(doc.workload ?? "0");
      if (!isPinned && !isNaN(wl) && wl > maxWorkload) continue;

      const openSections = (doc.sections ?? []).filter(
        (s: { enrollmentStatus?: string }) => s.enrollmentStatus === "open"
      );
      if (openSections.length === 0) continue;

      candidateCourses[code] = {
        title: doc.title ?? "",
        credits: doc.credits ?? 0,
        workload: doc.workload ?? "N/A",
        prereq_enforced: doc.prerequisites?.enforced ?? "N/A",
        ...(doc.prerequisites?.advisory && doc.prerequisites.advisory !== "N/A"
          ? { prereq_advisory: doc.prerequisites.advisory }
          : {}),
      };
    }

    if (Object.keys(candidateCourses).length === 0) {
      return NextResponse.json({
        error: `No courses found in the catalog for term ${term}.`,
      }, { status: 404 });
    }

    // ── 6. Preference blocks ──────────────────────────────────────────────────
    const prefBlocks = buildPreferenceBlocks(preferences, excludedDaysForCourses);
    const forcedCourses = [...new Set([...pinnedCourses, ...requiredCourses])];

    // ── 7. Shelf/retry loop ───────────────────────────────────────────────────
    const shelved: string[] = [];
    const prevSelectionSets: string[] = [];
    let toReplace: string | undefined;
    let finalSchedule: ScheduleEntry[] | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ROUNDS; attempt++) {
      console.log(`[/api/schedule] Attempt ${attempt}/${MAX_RETRY_ROUNDS}`);

      const aiResult = await geminiSelectCourses({
        completedCourses: completedCodes,
        targetCredits,
        maxWorkload,
        majorName,
        scoredBlocks,
        candidateCourses: Object.fromEntries(
          Object.entries(candidateCourses).filter(([k]) => !shelved.includes(k))
        ),
        shelved,
        replaceCode: toReplace,
        previousSelections: prevSelectionSets,
        forcedCourses,
      });

      const selections = aiResult.selections ?? [];
      if (selections.length === 0) { console.log("[/api/schedule] No selections"); break; }

      const selectionKey = selections.map((s) => s.course_code).sort().join(",");
      if (prevSelectionSets.includes(selectionKey)) { console.log("[/api/schedule] Repeated set"); break; }
      prevSelectionSets.push(selectionKey);

      const coursesToSchedule: CourseToSchedule[] = [];
      for (const sel of selections) {
        const doc = catalogMap[sel.course_code];
        if (!doc) continue;

        const rawSections: RawSection[] = (doc.sections ?? []).map((s: {
          sectionType?: string; sectionNumber?: string | number; instructors?: string[];
          meetings?: { days?: string; times?: string; location?: string }[];
          enrollmentStatus?: string; availableSeats?: number;
        }) => ({
          SectionNumber: s.sectionNumber ?? "001",
          SectionType: s.sectionType ?? "LEC",
          Instructors: s.instructors ?? [],
          Meetings: (s.meetings ?? []).map((m) => ({
            Days: m.days ?? "", Times: m.times ?? "", Location: m.location ?? "TBA",
          })),
          Status: s.enrollmentStatus === "open" ? "Open" : "Closed",
          EnrollmentStatus: s.enrollmentStatus,
          AvailableSeats: s.availableSeats ?? 0,
        }));

        const families = groupSectionsByFamily(rawSections);
        const allCombos: SectionCombo[] = [];
        for (const fam of families) allCombos.push(...buildSectionCombos(fam));

        if (allCombos.length > 0) {
          coursesToSchedule.push({
            code: sel.course_code, title: sel.course_title,
            credits: sel.credits, workload: String(sel.workload_percent ?? "N/A"),
            combos: allCombos,
          });
        }
      }

      const result = findValidSchedule(coursesToSchedule, prefBlocks);

      if (result.success) {
        finalSchedule = result.schedule;
        console.log(`[/api/schedule] Valid schedule on attempt ${attempt}`);
        break;
      }

      const conflicts = result.conflicts.filter((c) => !forcedCourses.includes(c));
      const toShelve = conflicts[0];
      if (toShelve && !shelved.includes(toShelve)) {
        console.log(`[/api/schedule] Shelving ${toShelve}`);
        shelved.push(toShelve);
        toReplace = toShelve;
      } else {
        console.log("[/api/schedule] Cannot resolve conflicts");
        break;
      }
    }

    if (!finalSchedule || finalSchedule.length === 0) {
      return NextResponse.json({
        error: "Could not build a conflict-free schedule. Try adjusting preferences or target credits.",
      }, { status: 422 });
    }

    // ── 8. Build output ───────────────────────────────────────────────────────
    const totalCredits = finalSchedule.reduce((sum, c) => sum + c.credits, 0);

    const courses: ScheduledCourse[] = finalSchedule.map((entry, idx) => {
      const sections: ScheduledSection[] = [];

      for (const sec of [entry.lecture, ...entry.linked]) {
        const meetings: ScheduledMeeting[] = (sec.Meetings ?? [])
          .map((m) => {
            const days = expandDays(m.Days ?? m.days ?? "");
            const parsed = parseTimeToMinutes(m.Times ?? m.times ?? "");
            if (!parsed || days.length === 0) return null;
            return {
              days,
              startTime: minutesToTimeStr(parsed.start),
              endTime: minutesToTimeStr(parsed.end),
              location: m.Location ?? m.location ?? "TBA",
            };
          })
          .filter(Boolean) as ScheduledMeeting[];

        sections.push({
          sectionType: sec.SectionType ?? "LEC",
          sectionNumber: String(sec.SectionNumber ?? "001"),
          instructor: (sec.Instructors ?? [])[0] ?? "Staff",
          meetings,
        });
      }

      return {
        courseCode: entry.code,
        title: entry.title,
        credits: entry.credits,
        color: COURSE_COLORS[idx % COURSE_COLORS.length],
        sections,
      };
    });

    const schedule: ScheduleOutput = {
      term,
      termLabel: TERM_LABELS[term] ?? `Term ${term}`,
      totalCredits,
      courses,
    };

    return NextResponse.json({ schedule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/schedule]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}