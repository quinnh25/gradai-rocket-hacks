/**
 * scripts/seed-courses.ts
 *
 * Imports unified_catalog.json (the format you showed — object keyed by courseId)
 * into the MongoDB "courses" collection.
 *
 * Usage:
 *   npx tsx scripts/seed-courses.ts path/to/unified_catalog.json
 */

import { MongoClient, Db } from "mongodb";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawMeeting {
  Days: string;
  Times: string;
  Location: string;
  Instructor: string;
  StartDate: string;
  EndDate: string;
}

interface RawSection {
  SectionNumber: string | number;
  SectionType: string;
  SectionTypeDescr: string;
  InstructionMode: string;
  ClassNumber: number;
  CreditHours: number | string;
  EnrollmentStatus: string;
  EnrollmentTotal: number;
  EnrollmentCapacity: number;
  AvailableSeats: number;
  WaitTotal: number;
  WaitCapacity: number;
  Status: string;
  Instructors: string[];
  Meetings: RawMeeting[];
}

interface RawCourse {
  course_code: string;
  course_title: string;
  course_description: string;
  credits: number | string;
  school_code: string;
  term: string;
  metrics: { workload_percent: string };
  prerequisites: { advisory: string; enforced: string };
  availability: RawSection[];
}

interface Section {
  sectionNumber: string;
  sectionType: string;
  instructionMode: string;
  instructors: string[];
  meetings: { days: string; times: string; location: string }[];
  enrollmentStatus: string;
  availableSeats: number;
  waitTotal: number;
  classNumber: number;
}

interface CourseDocument {
  courseId: string;          // "EECS 281"
  title: string;
  description: string;
  credits: number;           // 0 = variable
  department: string;        // "EECS"
  schoolCode: string;        // "ENG" | "LSA"
  term: string;
  workload: string | null;   // "72" or null
  prerequisites: {
    advisory: string;
    enforced: string;
  };
  sections: Section[];
  tags: string[];            // derived tags for AI search
  createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDepartment(courseId: string): string {
  // "EECS 281" → "EECS", "MATH 215" → "MATH"
  return courseId.split(" ")[0].toUpperCase();
}

function parseCredits(raw: number | string): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    // "1 - 4" → take the max
    const parts = raw.match(/\d+/g);
    if (parts && parts.length > 0) return parseInt(parts[parts.length - 1]);
  }
  return 0;
}

function deriveTags(course: RawCourse): string[] {
  const tags: string[] = [];

  const workload = parseInt(course.metrics?.workload_percent ?? "0");
  if (!isNaN(workload)) {
    if (workload >= 70) tags.push("high-workload");
    else if (workload >= 40) tags.push("medium-workload");
    else if (workload > 0) tags.push("low-workload");
  }

  const hasLab = course.availability.some(
    (s) => s.SectionType === "LAB"
  );
  if (hasLab) tags.push("lab-required");

  const hasDiscussion = course.availability.some(
    (s) => s.SectionType === "DIS"
  );
  if (hasDiscussion) tags.push("discussion-required");

  const credits = parseCredits(course.credits);
  if (credits === 4) tags.push("4-credit");
  else if (credits === 3) tags.push("3-credit");
  else if (credits === 2) tags.push("2-credit");
  else if (credits === 0) tags.push("variable-credit");

  const dept = parseDepartment(course.course_code);
  tags.push(`dept-${dept.toLowerCase()}`);

  const hasEnforced =
    course.prerequisites?.enforced &&
    course.prerequisites.enforced !== "N/A" &&
    course.prerequisites.enforced.trim() !== "";
  if (hasEnforced) tags.push("has-prerequisites");

  const isGradLevel = parseInt(course.course_code.replace(/\D/g, "")) >= 500;
  if (isGradLevel) tags.push("graduate-level");

  // Keyword tags from description
  const desc = (course.course_description ?? "").toLowerCase();
  const titleLower = (course.course_title ?? "").toLowerCase();
  const combined = desc + " " + titleLower;
  if (/machine learning|neural network|deep learning/.test(combined))
    tags.push("machine-learning");
  if (/algorithm|data struct/.test(combined)) tags.push("algorithms");
  if (/operating system|os/.test(combined)) tags.push("operating-systems");
  if (/database|sql/.test(combined)) tags.push("databases");
  if (/network|internet|protocol/.test(combined)) tags.push("networking");
  if (/security|cryptograph|cipher/.test(combined)) tags.push("security");
  if (/embedded|fpga|hardware/.test(combined)) tags.push("hardware");
  if (/signal|fourier|filter/.test(combined)) tags.push("signal-processing");
  if (/circuit|analog|vlsi/.test(combined)) tags.push("circuits");
  if (/robot|autonomous|kinematics/.test(combined)) tags.push("robotics");
  if (/computer vision|image/.test(combined)) tags.push("computer-vision");
  if (/natural language|nlp|text/.test(combined)) tags.push("nlp");
  if (/web|http|browser/.test(combined)) tags.push("web");
  if (/design project|mde|senior design/.test(combined)) tags.push("design-experience");
  if (/probability|statistics|stochastic/.test(combined)) tags.push("probability-stats");

  return [...new Set(tags)]; // dedupe
}

function transformSection(s: RawSection): Section {
  return {
    sectionNumber: String(s.SectionNumber),
    sectionType: s.SectionType,
    instructionMode: s.InstructionMode,
    instructors: s.Instructors ?? [],
    meetings: (s.Meetings ?? []).map((m) => ({
      days: m.Days,
      times: m.Times,
      location: m.Location,
    })),
    enrollmentStatus: s.EnrollmentStatus,
    availableSeats: s.AvailableSeats,
    waitTotal: s.WaitTotal,
    classNumber: s.ClassNumber,
  };
}

function transformCourse(raw: RawCourse): CourseDocument {
  return {
    courseId: raw.course_code,
    title: raw.course_title,
    description: raw.course_description,
    credits: parseCredits(raw.credits),
    department: parseDepartment(raw.course_code),
    schoolCode: raw.school_code,
    term: raw.term,
    workload: raw.metrics?.workload_percent !== "N/A"
      ? raw.metrics?.workload_percent ?? null
      : null,
    prerequisites: {
      advisory: raw.prerequisites?.advisory ?? "",
      enforced: raw.prerequisites?.enforced ?? "",
    },
    sections: (raw.availability ?? []).map(transformSection),
    tags: deriveTags(raw),
    createdAt: new Date(),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/seed-courses.ts <path-to-catalog.json>");
    process.exit(1);
  }

  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error("DATABASE_URL not set in environment");
    process.exit(1);
  }

  // The catalog JSON is an object: { "EECS 281": {...}, "MATH 115": {...} }
  const raw: Record<string, RawCourse> = JSON.parse(
    fs.readFileSync(path.resolve(filePath), "utf-8")
  );

  const courses = Object.values(raw);
  console.log(`📚 Found ${courses.length} course(s) to seed`);

  const client = new MongoClient(uri);
  await client.connect();
  const db: Db = client.db();

  const col = db.collection<CourseDocument>("courses");

  // Create index on courseId for fast lookups
  await col.createIndex({ courseId: 1, term: 1 }, { unique: true });
  await col.createIndex({ department: 1 });
  await col.createIndex({ tags: 1 });
  console.log("✅ Indexes created");

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const BATCH_SIZE = 50;
  const chunks: RawCourse[][] = [];
  for (let i = 0; i < courses.length; i += BATCH_SIZE) {
    chunks.push(courses.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const ops = chunk.map((raw) => {
      const doc = transformCourse(raw);
      return {
        updateOne: {
          filter: { courseId: doc.courseId, term: doc.term },
          update: { $set: doc },
          upsert: true,
        },
      };
    });

    const result = await col.bulkWrite(ops);
    inserted += result.upsertedCount;
    updated += result.modifiedCount;
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);

  // Print tag summary
  const tagPipeline = await col
    .aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ])
    .toArray();

  console.log("\nTop tags:");
  tagPipeline.forEach((t) => console.log(`  ${t._id}: ${t.count}`));

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
