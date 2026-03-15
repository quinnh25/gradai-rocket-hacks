/**
 * scripts/seed-programs.ts
 *
 * Usage:
 *   npx tsx scripts/seed-programs.ts path/to/programs.json
 *
 * Install tsx if needed:
 *   npm install -D tsx
 */

import { MongoClient, Db } from "mongodb";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawRequirementBlock {
  block_name: string;
  credits_required_for_block: number;
  courses_required_for_block?: number;
  mandatory_courses?: string[];
  elective_options?: string[];
  rules_and_restrictions?: string;
}

interface RawProgram {
  program_name: string;
  program_type: string;
  college: string;
  academic_year?: string;
  overall_total_credits: number;
  requirement_blocks: RawRequirementBlock[];
}

interface RequirementBlock {
  blockName: string;
  creditsRequired: number;
  coursesRequired: number;
  mandatoryCourses: string[];
  electiveOptions: string[];
  rules: string;
}

interface ProgramDocument {
  programName: string;
  programType: string;
  college: string;
  academicYear: string;
  totalCredits: number;
  requirementBlocks: RequirementBlock[];
  createdAt: Date;
}

// ─── Transform ────────────────────────────────────────────────────────────────

function transformProgram(raw: RawProgram): ProgramDocument {
  return {
    programName: raw.program_name,
    programType: raw.program_type,
    college: raw.college,
    academicYear: raw.academic_year ?? "2025-2026",
    totalCredits: raw.overall_total_credits,
    requirementBlocks: raw.requirement_blocks.map((b) => ({
      blockName: b.block_name,
      creditsRequired: b.credits_required_for_block,
      coursesRequired: b.courses_required_for_block ?? 0,
      mandatoryCourses: (b.mandatory_courses ?? []).map((c) => c.trim()),
      electiveOptions: (b.elective_options ?? []).map((c) => c.trim()),
      rules: b.rules_and_restrictions ?? "",
    })),
    createdAt: new Date(),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/seed-programs.ts <path-to-programs.json>");
    process.exit(1);
  }

  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error("DATABASE_URL not set in environment");
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf-8"));
  const raw: RawProgram[] = Array.isArray(parsed) ? parsed : [parsed];

  console.log(`📋 Found ${raw.length} program(s) to seed`);

  const client = new MongoClient(uri);
  await client.connect();
  const db: Db = client.db(); // uses the DB name from your connection string

  const col = db.collection<ProgramDocument>("programs");

  let inserted = 0;
  let updated = 0;

  for (const rawProgram of raw) {
    const doc = transformProgram(rawProgram);

    // Upsert: match on name + type + academic year so re-running is safe
    const result = await col.updateOne(
      {
        programName: doc.programName,
        programType: doc.programType,
        academicYear: doc.academicYear,
      },
      { $set: doc },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      inserted++;
      console.log(`  ✅ Inserted: ${doc.programName} (${doc.programType})`);
    } else {
      updated++;
      console.log(`  🔄 Updated:  ${doc.programName} (${doc.programType})`);
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated.`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
