import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Initialize the Gemini Client
client = genai.Client(
    vertexai=True,
    project="banded-torus-490217-p0",  # <-- Put your actual Google Cloud Project ID here!
    location="us-central1"
)


# ---------------------------------------------------------------------------
# Database Helpers
# ---------------------------------------------------------------------------

def load_json_db(filepath):
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"⚠️  Warning: {filepath} not found. Using empty dict for testing.")
        return {}


# ---------------------------------------------------------------------------
# Step 1 – Extract only the course codes this student still needs
# ---------------------------------------------------------------------------

def extract_needed_course_codes(major_rules: dict, completed_courses: set) -> set:
    """
    Walk the requirements tree and return every course code the student
    has NOT yet completed.  Handles required courses, choose-N elective
    lists, and concentration / track sub-sections.
    """
    needed = set()

    def _walk(node):
        """Recursively collect course codes from any dict/list structure."""
        if isinstance(node, list):
            for item in node:
                _walk(item)
        elif isinstance(node, dict):
            # Direct course code keys
            code = node.get("course_code") or node.get("code")
            if code and code not in completed_courses:
                needed.add(code)
            # Recurse into every value so we don't miss nested structures
            for value in node.values():
                if isinstance(value, (dict, list)):
                    _walk(value)

    _walk(major_rules.get("requirements", []))
    _walk(major_rules.get("electives", []))
    _walk(major_rules.get("concentrations", []))

    return needed


# ---------------------------------------------------------------------------
# Step 2 – Slim each catalog entry to only what the LLM needs
# ---------------------------------------------------------------------------

def slim_course_entry(code: str, data: dict) -> dict:
    """
    Strip a catalog entry down to the 6–7 fields relevant for scheduling.
    Truncates long descriptions to keep token count low.
    """
    sections = []
    for s in data.get("availability", []):
        sections.append({
            "section_id": s.get("section_id") or s.get("Section"),
            "days":        s.get("days")       or s.get("Days"),
            "time":        s.get("meeting_time") or s.get("Time"),
            "status":      s.get("Status", "Open"),
        })

    return {
        "code":             code,
        "title":            data.get("title") or data.get("course_title", ""),
        "credits":          data.get("credits", 0),
        "workload_percent": data.get("metrics", {}).get("workload_percent", "N/A"),
        "description":      (data.get("description", "") or "")[:200],
        "open_sections":    sections,
    }


# ---------------------------------------------------------------------------
# Step 3 – Pre-filter the entire catalog down to a relevant shortlist
# ---------------------------------------------------------------------------

def pre_filter_catalog(user_profile: dict, major_rules: dict, catalog_db: dict) -> dict:
    """
    Returns a slimmed catalog that contains ONLY:
      • Courses the student still needs (per major rules)
      • Courses within the workload limit
      • Courses that have at least one open section
    """
    completed   = set(user_profile.get("completed_courses", []))
    max_workload = user_profile.get("preferences", {}).get("max_workload_percent_per_class", 100)

    needed_codes = extract_needed_course_codes(major_rules, completed)
    print(f"   📋 Courses still needed by major rules : {len(needed_codes)}")

    filtered = {}
    for code in needed_codes:
        if code not in catalog_db:
            continue  # course not offered this term

        data = catalog_db[code]

        # Workload gate
        raw_wl = data.get("metrics", {}).get("workload_percent", 0)
        try:
            if float(raw_wl) > max_workload:
                continue
        except (ValueError, TypeError):
            pass  # "N/A" or missing → keep the course

        # Availability gate – keep only open sections
        open_sections = [s for s in data.get("availability", []) if s.get("Status") == "Open"]
        if not open_sections:
            continue

        entry = data.copy()
        entry["availability"] = open_sections
        filtered[code] = slim_course_entry(code, entry)

    print(f"   ✅ Courses remaining after pre-filter  : {len(filtered)}")
    return filtered


# ---------------------------------------------------------------------------
# Shared Gemini helper
# ---------------------------------------------------------------------------

def call_gemini(prompt_obj: dict, system_instruction: str) -> dict:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=json.dumps(prompt_obj),
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    return json.loads(response.text)


# ---------------------------------------------------------------------------
# Phase 1 – Select the best courses (no time-conflict logic yet)
# ---------------------------------------------------------------------------

PHASE1_SYSTEM = """
You are an Academic Requirements Advisor for the University of Michigan.

Given a student profile and a pre-filtered list of candidate courses, select
the courses that best fulfil the student's remaining degree requirements.

RULES:
1. Never recommend a course the student has already completed.
2. Respect the `max_workload_percent_per_class` preference.
3. Choose enough courses so total credits can reach `target_credits_this_term`,
   but do NOT worry about time conflicts yet — that comes next.
4. Prefer courses that satisfy required/core requirements over free electives.
5. Aim for variety: do not stack multiple lab courses or multiple heavy courses.

OUTPUT — return strictly valid JSON:
{
    "selections": [
        {
            "course_code": "EECS 280",
            "course_title": "Programming and Data Structures",
            "credits": 4,
            "workload_percent": 45,
            "requirement_fulfilled": "CS Core",
            "reasoning": "One-line rationale."
        }
    ],
    "notes": "Any caveats about missing requirements or limited options."
}
"""

def phase1_select_courses(user_profile: dict, filtered_catalog: dict) -> dict:
    print("\n🔍 Phase 1 — Selecting best courses for requirements...")

    prompt = {
        "task": (
            "Select courses that satisfy the student's remaining requirements. "
            "Ignore time conflicts for now."
        ),
        "student": {
            "major":              user_profile.get("major"),
            "completed_courses":  user_profile.get("completed_courses", []),
            "target_credits":     user_profile.get("target_credits_this_term"),
            "preferences":        user_profile.get("preferences", {}),
        },
        "candidate_courses": filtered_catalog,
    }

    result = call_gemini(prompt, PHASE1_SYSTEM)
    print(f"   🎯 Phase 1 selected {len(result.get('selections', []))} courses")
    return result


# ---------------------------------------------------------------------------
# Phase 2 – Build a conflict-free schedule from the Phase 1 picks
# ---------------------------------------------------------------------------

PHASE2_SYSTEM = """
You are an Academic Schedule Builder for the University of Michigan.

Given a list of pre-selected courses and their available sections, build a
conflict-free weekly schedule that respects the student's time preferences.

RULES:
1. Pick exactly ONE section per course.
2. No two selected sections may have overlapping meeting times.
3. Obey `avoid_mornings` (no classes before 10:00 AM) if True.
4. Obey `free_fridays` (no Friday meetings) if True.
5. Report total credits and average workload.

OUTPUT — return strictly valid JSON:
{
    "recommended_schedule": [
        {
            "course_code": "EECS 280",
            "course_title": "Programming and Data Structures",
            "credits": 4,
            "workload_percent": 45,
            "selected_section_id": "002",
            "selected_section_time": "Tu/Th 10:30 AM – 12:00 PM",
            "reasoning": "One-line rationale."
        }
    ],
    "total_credits": 16,
    "average_workload": 38.5,
    "warnings": ["List any constraints that could not be fully satisfied."]
}
"""

def phase2_build_schedule(user_profile: dict, phase1_result: dict, filtered_catalog: dict) -> dict:
    print("\n🗓️  Phase 2 — Resolving time conflicts and building final schedule...")

    # Only pass back the sections for courses Phase 1 actually selected
    picked_codes   = [c["course_code"] for c in phase1_result.get("selections", [])]
    picked_catalog = {code: filtered_catalog[code] for code in picked_codes if code in filtered_catalog}

    prompt = {
        "task": "Assign conflict-free sections to the pre-selected courses.",
        "preferences": user_profile.get("preferences", {}),
        "target_credits": user_profile.get("target_credits_this_term"),
        "selected_courses": picked_catalog,
    }

    result = call_gemini(prompt, PHASE2_SYSTEM)
    print(f"   ✅ Final schedule has {result.get('total_credits', '?')} credits")
    return result


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def build_schedule_with_ai(user_profile: dict, rules_db: list, catalog_db: dict) -> dict:
    print("🧠 Initializing AI Schedule Optimizer...\n")

    # Locate this student's major rules
    user_major  = user_profile.get("major")
    major_rules = next((p for p in rules_db if p.get("program_name") == user_major), {})
    if not major_rules:
        print(f"⚠️  Could not find rules for major '{user_major}'. Check master.json.")

    # --- Programmatic pre-filter (no AI tokens wasted here) ---
    print("📦 Pre-filtering catalog...")
    filtered_catalog = pre_filter_catalog(user_profile, major_rules, catalog_db)

    # --- Phase 1: requirement-aware course selection ---
    phase1_result = phase1_select_courses(user_profile, filtered_catalog)

    # --- Phase 2: conflict-free section assignment ---
    final_schedule = phase2_build_schedule(user_profile, phase1_result, filtered_catalog)

    return final_schedule


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    rules   = load_json_db("master.json")
    catalog = load_json_db("unified_catalog.json")

    test_user = {
        "major": "Computer Engineering",
        "completed_courses": ["MATH 115", "ENGR 100", "CHEM 130", "CHEM 125", "CHEM 126"],
        "target_credits_this_term": 18,
        "preferences": {
            "max_workload_percent_per_class": 80,
            "avoid_mornings": False,
            "free_fridays": False,
        },
    }

    final_schedule = build_schedule_with_ai(test_user, rules, catalog)

    print("\n✅ OPTIMIZED SCHEDULE GENERATED:\n")
    print(json.dumps(final_schedule, indent=4))