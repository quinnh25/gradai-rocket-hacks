import json
import re
from collections import defaultdict
from datetime import time as dtime
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(
    vertexai=True,
    project="banded-torus-490217-p0",  # <-- Your Google Cloud Project ID
    location="us-central1"
)

MAX_RETRY_ROUNDS = 5  # Max times we ask Gemini to fix conflicts


# =============================================================================
# DATABASE HELPERS
# =============================================================================

def load_json_db(filepath):
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Warning: {filepath} not found.")
        return {}


# =============================================================================
# STEP 1 - EXTRACT NEEDED COURSE CODES FROM MAJOR RULES
# =============================================================================

def extract_needed_course_codes(major_rules: dict, completed_courses: set) -> set:
    # Normalize the completed set so "MATH115", "math 115", "MATH 115" all match
    completed_norm = {re.sub(r' +', ' ', re.sub(r'([A-Z])(\d)', r'\1 \2', c.strip().upper())) for c in completed_courses}
    needed = set()
    for block in major_rules.get("requirement_blocks", []):
        for code in block.get("mandatory_courses", []):
            if isinstance(code, str) and code.upper() not in completed_norm:
                needed.add(code)
        for code in block.get("elective_options", []):
            if isinstance(code, str) and code.upper() not in completed_norm:
                needed.add(code)
    return needed




def normalize_code(code: str) -> str:
    """Normalize a course code to uppercase with one space: 'eecs280' -> 'EECS 280'."""
    code = code.strip().upper()
    code = re.sub(r'([A-Z])(\d)', r'\1 \2', code)
    code = re.sub(r' +', ' ', code)
    return code


# =============================================================================
# STEP 2 - TIME PARSING AND CONFLICT DETECTION
# =============================================================================

DAY_MAP = {
    "Mo": "Mo", "Tu": "Tu", "We": "We", "Th": "Th", "Fr": "Fr", "Sa": "Sa",
    "M":  "Mo", "T":  "Tu", "W":  "We", "R":  "Th", "F":  "Fr",
    "Monday": "Mo", "Tuesday": "Tu", "Wednesday": "We",
    "Thursday": "Th", "Friday": "Fr", "Saturday": "Sa",
}

def parse_days(days_str: str) -> list:
    """Parse a days string like 'MWF', 'TuTh', 'Mo We Fr' into a canonical list."""
    if not days_str or days_str.strip().upper() == "TBA":
        return []
    s = days_str.strip()
    if " " in s:
        parts = s.split()
        return [DAY_MAP[p] for p in parts if p in DAY_MAP]
    result = []
    i = 0
    while i < len(s):
        two = s[i:i+2]
        if two in DAY_MAP:
            result.append(DAY_MAP[two])
            i += 2
        elif s[i] in DAY_MAP:
            result.append(DAY_MAP[s[i]])
            i += 1
        else:
            i += 1
    return result


def parse_time_range(time_str: str):
    """Parse '10:00AM - 11:30AM' into (dtime, dtime). Returns None if unparseable."""
    if not time_str or time_str.strip().upper() == "TBA":
        return None
    cleaned = re.sub(r'\s*[-\u2013\u2014]\s*', '-', time_str.strip())
    parts = cleaned.split('-')
    if len(parts) != 2:
        return None
    try:
        from datetime import datetime
        def to_dtime(s):
            s = s.strip().upper().replace(' ', '')
            fmt = "%I:%M%p" if ':' in s else "%I%p"
            return datetime.strptime(s, fmt).time()
        return to_dtime(parts[0]), to_dtime(parts[1])
    except Exception:
        return None


def times_overlap(a_start, a_end, b_start, b_end) -> bool:
    return a_start < b_end and b_start < a_end


class TimeBlock:
    """
    A named block of occupied time on specific days.
    Used for both real course sections and user preference blocks
    (e.g. avoid_mornings blocks Mon-Fri 12:00AM-10:00AM).
    """
    def __init__(self, label: str, days: list, start, end):
        self.label = label
        self.days  = set(days)
        self.start = start
        self.end   = end

    def conflicts_with(self, other) -> bool:
        if not (self.days & other.days):
            return False
        return times_overlap(self.start, self.end, other.start, other.end)

    def __repr__(self):
        return f"TimeBlock({self.label}, {sorted(self.days)}, {self.start}-{self.end})"


def build_preference_blocks(preferences: dict) -> list:
    """
    Convert user preference flags into TimeBlock objects.
    The scheduler treats these exactly like occupied course slots.
    """
    blocks = []
    all_weekdays = ["Mo", "Tu", "We", "Th", "Fr"]

    if preferences.get("avoid_mornings"):
        blocks.append(TimeBlock(
            label="[PREF] No mornings",
            days=all_weekdays,
            start=dtime(0, 0),
            end=dtime(10, 0),
        ))
        print("   Preference block: no classes before 10:00 AM (Mon-Fri)")

    if preferences.get("free_fridays"):
        blocks.append(TimeBlock(
            label="[PREF] Free Fridays",
            days=["Fr"],
            start=dtime(0, 0),
            end=dtime(23, 59),
        ))
        print("   Preference block: no classes on Friday")

    for cb in preferences.get("custom_blocks", []):
        t_start = dtime(*map(int, cb["start"].split(":")))
        t_end   = dtime(*map(int, cb["end"].split(":")))
        blocks.append(TimeBlock(
            label=f"[PREF] {cb.get('label', 'Custom block')}",
            days=cb.get("days", all_weekdays),
            start=t_start,
            end=t_end,
        ))
        print(f"   Preference block: {cb.get('label', 'Custom block')}")

    return blocks


def section_to_timeblocks(section: dict, label_prefix: str) -> list:
    """Convert a raw section dict (with Meetings[]) into TimeBlock objects."""
    blocks = []
    for m in section.get("Meetings", []):
        days = parse_days(m.get("Days", "TBA"))
        tr   = parse_time_range(m.get("Times", "TBA"))
        if days and tr:
            blocks.append(TimeBlock(
                label=f"{label_prefix} sec {section.get('SectionNumber')} ({section.get('SectionType')})",
                days=days,
                start=tr[0],
                end=tr[1],
            ))
    return blocks


# =============================================================================
# STEP 3 - SECTION FAMILY GROUPING
# =============================================================================

def group_sections_by_family(availability: list) -> list:
    """
    Group Open sections into (lecture, [linked_section, ...]) families.

    Grouping rule: a LAB/DIS/REC belongs to the lecture whose section number
    shares the same HUNDREDS digit.
      LEC 001 → family 0 → owns LAB 011, 012, 013 ...
      LEC 002 → family 0 → owns LAB 021, 022 ...  (different lecture, same hundred)

    Wait — two lectures in the same hundred means we need to separate them.
    Correct rule: each LEC is its own "parent"; linked sections are assigned to
    the nearest LEC whose hundreds digit matches.

    Implemented as:
      1. Collect all LECs and all non-LEC sections separately.
      2. For each non-LEC section, find the LEC whose section number shares
         the same hundreds digit (floor(num / 10) == floor(lec_num / 10) for
         two-digit suffixes, or same leading digit for three-digit numbers).
      3. If no matching LEC exists, try the closest LEC by number.
      4. Return one entry per LEC: {"lecture": sec, "linked": [secs...]}.

    This means the scheduler gets one entry per lecture, and must independently
    pick which linked sections to pair with it (handled in build_section_combos).
    """
    lectures = []
    linked   = []

    for s in availability:
        if s.get("Status") != "Open":
            continue
        stype = s.get("SectionType", "").upper()
        if stype == "LEC":
            lectures.append(s)
        else:
            linked.append(s)

    if not lectures:
        return []

    def padded(s):
        return str(s.get("SectionNumber", "000")).strip().zfill(3)

    # Key each LEC by its full padded number
    lec_by_num = {padded(lec): lec     for lec in lectures}
    lec_linked = {padded(lec): []      for lec in lectures}

    # A lab/dis/rec belongs to the LEC whose last two digits match its first two.
    # e.g. LAB "011" → prefix "01" → matches LEC "001" (last two digits = "01")
    #      LAB "021" → prefix "02" → matches LEC "002" (last two digits = "02")
    # For 4-digit section numbers, use first digit to match LEC first digit.
    for s in linked:
        s_pad   = padded(s)
        s_prefix = s_pad[:2]            # e.g. "01" for lab 011
        # Find LEC whose padded number ends with s_prefix
        match = next(
            (k for k in lec_by_num if k[1:] == s_prefix   # "001"[1:] == "01"
             or k[:2] == s_prefix),                         # fallback: first two
            None
        )
        if match is None:
            # Numerical fallback: assign to closest LEC
            s_int   = int(s_pad)
            match   = min(lec_by_num.keys(), key=lambda k: abs(int(k) - s_int))
        lec_linked[match].append(s)

    return [
        {"lecture": lec_by_num[k], "linked": lec_linked[k]}
        for k in sorted(lec_by_num.keys())
    ]


def build_section_combos(family: dict) -> list:
    """
    Expand a (lecture, linked_sections) family into every valid
    lecture × linked-section combination the scheduler should try.

    For EECS 270 with LEC 001 and LABs 011-018:
      → [(LEC001, LAB011), (LEC001, LAB012), ..., (LEC001, LAB018)]

    If there are multiple linked-section types (e.g. both a LAB and a DIS),
    we produce the cartesian product across types.

    If there are no linked sections, returns [(lecture, [])] — just the lecture.
    """
    from itertools import product as iproduct

    lec    = family["lecture"]
    linked = family["linked"]

    if not linked:
        return [(lec, [])]

    # Group linked sections by type
    by_type = defaultdict(list)
    for s in linked:
        by_type[s.get("SectionType", "OTHER").upper()].append(s)

    # Cartesian product across types: pick one section per type
    type_lists = list(by_type.values())
    combos = []
    for combo in iproduct(*type_lists):
        combos.append((lec, list(combo)))

    return combos


# =============================================================================
# STEP 4 - CATALOG SLIMMING AND PRE-FILTER
# =============================================================================

def slim_section_for_ai(section: dict) -> dict:
    meetings = [
        {"days": m.get("Days"), "time": m.get("Times")}
        for m in section.get("Meetings", [])
        if m.get("Days") not in (None, "TBA")
    ]
    return {
        "section_number": str(section.get("SectionNumber")),
        "type":           section.get("SectionType"),
        "class_number":   section.get("ClassNumber"),
        "seats":          section.get("AvailableSeats", 0),
        "meetings":       meetings,
    }


def slim_course_for_ai(code: str, data: dict) -> dict:
    """Slim a course entry for Gemini — shows families but no raw availability blob."""
    families = group_sections_by_family(data.get("availability", []))
    slim_families = [
        {
            "lecture": slim_section_for_ai(fam["lecture"]),
            "linked":  [slim_section_for_ai(s) for s in fam["linked"]],
        }
        for fam in families
    ]
    prereqs  = data.get("prerequisites", {})
    enforced = (prereqs.get("enforced") or "N/A").strip() if isinstance(prereqs, dict) else "N/A"
    advisory = (prereqs.get("advisory") or "N/A").strip() if isinstance(prereqs, dict) else "N/A"

    entry = {
        "code":             code,
        "title":            data.get("course_title") or data.get("title", ""),
        "credits":          data.get("credits", 0),
        "workload_percent": data.get("metrics", {}).get("workload_percent", "N/A"),
        "description":      (data.get("course_description") or "")[:150],
        "section_families": slim_families,
        "prereq_enforced":  enforced,
    }
    if advisory and advisory.upper() not in ("N/A", "NONE", ""):
        entry["prereq_advisory"] = advisory
    return entry


# Priority tiers sent to Gemini so it knows what to pick first
def score_block_urgency(block: dict, completed: set) -> float:
    """
    Compute a 0-1 urgency score for a requirement block using only its
    structural properties — no keyword matching, works for any college/major.

    High urgency (close to 1.0) = block has many mandatory courses and few
    or no choices, meaning the student has little flexibility and must take
    these courses to make degree progress.

    Low urgency (close to 0.0) = block is a large pick-N-from-M elective
    pool, meaning the student has many options and can defer.

    Formula components:
      mandatory_ratio  — fraction of total block courses that are mandatory
                         (not elective). All-mandatory blocks score 1.0 here.
      choice_pressure  — how many courses the block REQUIRES vs how many
                         options exist. e.g. "pick 2 of 20" scores low;
                         "take all 6" scores high.
      completion_gap   — fraction of required block credits not yet earned.
                         A block the student has barely started scores higher.
    """
    mandatory = [c for c in block.get("mandatory_courses", [])
                 if isinstance(c, str) and c not in completed]
    elective  = [c for c in block.get("elective_options", [])
                 if isinstance(c, str) and c not in completed]

    total_options = len(mandatory) + len(elective)
    if total_options == 0:
        return 0.0  # block already satisfied or has no courses

    # How mandatory is this block?  1.0 = fully mandatory, 0.0 = fully elective
    mandatory_ratio = len(mandatory) / total_options

    # How much choice pressure exists?
    # courses_required_for_block = 0 means "take everything mandatory"
    n_required = block.get("courses_required_for_block", 0)
    if n_required > 0 and total_options > 0:
        choice_pressure = min(n_required / total_options, 1.0)
    else:
        # No explicit count — if all mandatory, full pressure; else low
        choice_pressure = 1.0 if len(elective) == 0 else 0.3

    # Completion gap — how far through this block is the student?
    credits_required = block.get("credits_required_for_block", 0)
    # We don't track credits earned per block, so use remaining course count
    # as a proxy: more remaining courses = larger gap = higher urgency
    completion_gap = min(len(mandatory) / max(total_options, 1), 1.0)

    # Weighted combination — mandatory_ratio drives it most
    score = (mandatory_ratio * 0.5) + (choice_pressure * 0.3) + (completion_gap * 0.2)
    return round(score, 3)


def score_all_blocks(major_rules: dict, completed: set) -> list:
    """
    Return all requirement blocks sorted by urgency score descending.
    Each entry: {block_name, urgency, mandatory_courses, elective_options,
                 credits_required, courses_required}
    """
    scored = []
    for block in major_rules.get("requirement_blocks", []):
        urgency = score_block_urgency(block, completed)
        if urgency == 0.0:
            continue  # skip satisfied/empty blocks
        scored.append({
            "block_name":       block.get("block_name", "Unknown"),
            "urgency":          urgency,
            "credits_required": block.get("credits_required_for_block", 0),
            "courses_required": block.get("courses_required_for_block", 0),
            "mandatory":        [c for c in block.get("mandatory_courses", [])
                                 if isinstance(c, str) and c not in completed],
            "elective_options": [c for c in block.get("elective_options", [])
                                 if isinstance(c, str) and c not in completed],
        })
    scored.sort(key=lambda b: b["urgency"], reverse=True)
    return scored


def build_course_metadata(scored_blocks: list) -> tuple:
    """
    From the urgency-sorted block list, produce:
      priority_map  — {course_code: urgency_score}  (highest score = pick first)
      block_map     — {course_code: block_name}
    Mandatory courses get the block's full urgency score.
    Elective options get the block urgency * 0.6 (lower priority than mandatory).
    """
    priority_map = {}
    block_map    = {}
    for block in scored_blocks:
        bname   = block["block_name"]
        urgency = block["urgency"]
        for code in block["mandatory"]:
            # Take the highest urgency if a course appears in multiple blocks
            if code not in priority_map or urgency > priority_map[code]:
                priority_map[code] = urgency
                block_map[code]    = bname
        for code in block["elective_options"]:
            elective_urgency = round(urgency * 0.6, 3)
            if code not in priority_map or elective_urgency > priority_map[code]:
                priority_map[code] = elective_urgency
                block_map[code]    = bname
    return priority_map, block_map


def is_light_lsa_filler(code: str, data: dict, max_wl: float = 40.0) -> bool:
    """
    True if a course is a good low-workload LSA filler (usable as IB credit).
    Entirely structural — checks school code and workload, no keyword matching.
    Works regardless of which college the student's major is in.
    """
    # Skip engineering / math / science departments — they're never light fillers
    dept_prefix = code.split()[0] if " " in code else code[:4]
    heavy_depts = {
        "EECS","CEE","ENGR","MATH","PHYSICS","CHEM","BIOMEDE","MECHENG",
        "AEROSP","MATSCIE","NAVARCH","NERS","IOE","ROB","CHE","EARTH",
        "STATS","DATASCI","BIOINF","BIOLOGY","MCDB","CMPLXSYS",
    }
    if dept_prefix in heavy_depts:
        return False
    school = data.get("school_code", "").upper()
    if school not in ("LSA", "SMTD", "KINES", "SOE"):
        return False
    raw_wl = data.get("metrics", {}).get("workload_percent", None)
    try:
        return float(raw_wl) <= max_wl
    except (ValueError, TypeError):
        return False  # unknown workload — don't assume it's light


def pre_filter_catalog(user_profile: dict, major_rules: dict, catalog_db: dict) -> dict:
    """
    Return raw catalog entries for:
      1. Courses the student still needs (from major rules), sorted by urgency.
      2. Light LSA filler courses usable as IB/breadth credits.

    Attaches a "_meta" key with:
      priority_map  — {code: urgency_score}  (used to sort Gemini's candidates)
      block_map     — {code: block_name}
      scored_blocks — urgency-ranked block list (sent to Gemini as context)
      filler_codes  — set of IB/breadth filler course codes
    """
    completed    = set(user_profile.get("completed_courses", []))
    max_workload = user_profile.get("preferences", {}).get(
        "max_workload_percent_per_class", 100)
    filler_wl    = user_profile.get("preferences", {}).get(
        "max_filler_workload", 40)  # separate cap for filler courses

    # ── Score and rank requirement blocks structurally ──
    scored_blocks = score_all_blocks(major_rules, completed)
    priority_map, block_map = build_course_metadata(scored_blocks)

    print(f"   Requirement blocks ranked by urgency:")
    for b in scored_blocks[:6]:  # show top 6
        print(f"     [{b['urgency']:.2f}] {b['block_name']}  "
              f"({len(b['mandatory'])} mandatory, {len(b['elective_options'])} elective options)")

    # ── Build filtered catalog (workload + availability gates only) ─────────────
    # Prereqs are passed to Gemini as data fields and enforced during selection.
    filtered     = {}
    filler_codes = set()

    def try_add(code, data, wl_cap):
        raw_wl = data.get("metrics", {}).get("workload_percent", 0)
        try:
            if float(raw_wl) > wl_cap:
                return False
        except (ValueError, TypeError):
            pass
        open_secs = [s for s in data.get("availability", []) if s.get("Status") == "Open"]
        if not open_secs:
            return False
        entry = data.copy()
        entry["availability"] = open_secs
        filtered[code] = entry
        return True

    for code in priority_map:
        if code in catalog_db:
            try_add(code, catalog_db[code], max_workload)

    for code, data in catalog_db.items():
        if code in filtered or code in completed:
            continue
        if is_light_lsa_filler(code, data, max_wl=filler_wl):
            if try_add(code, data, filler_wl):
                filler_codes.add(code)

    major_count = len(filtered) - len(filler_codes)
    print(f"   Courses available this term : {len(filtered)} "
          f"({major_count} major-required, {len(filler_codes)} breadth fillers)")

    filtered["_meta"] = {
        "priority_map":  priority_map,
        "block_map":     block_map,
        "scored_blocks": scored_blocks,
        "filler_codes":  list(filler_codes),
    }
    return filtered


# =============================================================================
# STEP 5 - GEMINI: PURE COURSE SELECTION (no scheduling logic)
# =============================================================================

SELECTION_SYSTEM = """
You are an Academic Requirements Advisor for the University of Michigan.

Your ONLY job is to select which courses the student should take this term.
A separate Python algorithm handles time conflicts — ignore scheduling entirely.

=== PREREQUISITE RULE (most important) ===
Every course in candidate_courses has a "prereq_enforced" field.
You MUST check this before selecting any course:

- Read the enforced prereq string and cross-reference it against
  the student's completed_courses list.
- If the student does NOT satisfy the enforced prereq, do NOT select that course.
- Common patterns to interpret:
    "EECS 280 or 183"       → student needs at least one of those
    "(MATH 115); (MATH 116)" → student needs BOTH groups
    "C or better"            → grade clause, NOT a course — ignore it
    "No credit in MATH 216"  → student must NOT have MATH 216
    "preceded or accompanied by X" → satisfied if X is already completed
- If prereq_enforced is "N/A" or empty, the course has no prereq — select freely.
- If a course has "prereq_advisory", you may still select it but note the warning
  in the reasoning field.

=== SELECTION PRIORITY ===
You will receive ranked_requirement_blocks sorted by urgency (highest first).
Work top-to-bottom: fill mandatory courses from the highest-urgency blocks first,
then program electives, then 1-2 breadth fillers (is_filler: true) to lower
average workload, then free electives only if credits still needed.

BREADTH RULE: pick from at least 3 different blocks before taking a second
course from any single block.

=== HARD RULES ===
1. NEVER select a course whose prereq_enforced the student does not satisfy.
2. Never recommend a course already in completed_courses.
3. Never exceed max_workload_per_class.
4. Reach approximately target_credits total.
5. Only pick from candidate_courses.
6. If conflicting_courses is provided: those courses have no valid time slots —
   replace ONLY them with alternatives. Keep all other selections.

OUTPUT: strictly valid JSON, no markdown.
{
    "selections": [
        {
            "course_code": "MATH 216",
            "course_title": "Introduction to Differential Equations",
            "credits": 4,
            "workload_percent": 54,
            "urgency_score": 0.9,
            "requirement_block": "Subjects Required by all Programs",
            "is_filler": false,
            "prereq_satisfied": true,
            "reasoning": "Mandatory core course; prereq MATH 116 is completed."
        }
    ],
    "notes": "Optional caveats."
}
"""


def gemini_select_courses(user_profile: dict, filtered_catalog: dict,
                           conflicting_courses=None) -> dict:
    meta          = filtered_catalog.get("_meta", {})
    priority_map  = meta.get("priority_map", {})   # {code: urgency_score float}
    block_map     = meta.get("block_map", {})       # {code: block_name}
    scored_blocks = meta.get("scored_blocks", [])   # urgency-sorted block list
    filler_codes  = set(meta.get("filler_codes", []))

    # Build slim catalog annotated with urgency score and filler flag
    slim_catalog = {}
    for code, data in filtered_catalog.items():
        if code == "_meta":
            continue
        entry = slim_course_for_ai(code, data)
        entry["urgency_score"]      = priority_map.get(code, 0.0)
        entry["requirement_block"]  = block_map.get(code, "Breadth / Filler")
        entry["is_filler"]          = code in filler_codes
        # advisory warnings now come directly from prereq_advisory field in slim_course_for_ai
        slim_catalog[code] = entry

    # For filler courses, strip section_families (Gemini doesn't need timing detail
    # for breadth courses — the scheduler handles section assignment)
    for code in filler_codes:
        if code in slim_catalog:
            slim_catalog[code].pop("section_families", None)
            slim_catalog[code]["note"] = "Breadth/IB filler — sections assigned automatically"

    # Pass the urgency-ranked block list so Gemini knows the priority order
    # without needing to interpret course names or block names
    ranked_blocks_for_prompt = [
        {
            "block_name":        b["block_name"],
            "urgency":           b["urgency"],
            "credits_required":  b["credits_required"],
            "mandatory_courses": b["mandatory"],
            "elective_options":  b["elective_options"][:10],  # cap to save tokens
        }
        for b in scored_blocks
    ]

    completed = user_profile.get("completed_courses", [])
    prompt = {
        "task": "Select courses for this student following the urgency-ranked blocks.",
        "student": {
            "major":              user_profile.get("major"),
            "completed_courses":  [normalize_code(c) for c in completed],
            "target_credits":     user_profile.get("target_credits_this_term"),
            "max_workload_per_class": user_profile.get("preferences", {}).get(
                "max_workload_percent_per_class", 100),
        },
        "ranked_requirement_blocks": ranked_blocks_for_prompt,
        "candidate_courses":         slim_catalog,
        "prereq_reminder": (
            "Before selecting any course, verify its prereq_enforced field against "
            "student.completed_courses. If the student does not satisfy the prereq, "
            "do NOT include that course in selections."
        ),
    }

    if conflicting_courses:
        prompt["conflicting_courses"] = conflicting_courses
        prompt["instruction"] = (
            f"The following courses have NO valid sections that fit the student's "
            f"time constraints (preference blocks, other courses): {conflicting_courses}. "
            "Replace ONLY these courses with alternatives from the same or adjacent "
            "urgency-ranked blocks. Keep all other previously-selected courses if possible."
        )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=json.dumps(prompt),
        config=types.GenerateContentConfig(
            system_instruction=SELECTION_SYSTEM,
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    return json.loads(response.text)


# =============================================================================
# STEP 6 - PYTHON BACKTRACKING SCHEDULER
# =============================================================================

def find_valid_schedule(selected_courses: list, raw_catalog: dict,
                         preference_blocks: list) -> dict:
    """
    Backtracking search over section families for each selected course.

    Preference blocks are treated as pre-occupied TimeBlocks, so no course
    section can overlap with them.

    Returns:
        {"success": True,  "schedule": [...], "total_credits": N, "average_workload": N}
      or
        {"success": False, "conflicts": [course_codes...], "message": "..."}
    """
    # Build list of courses with every possible LEC×linked combo pre-expanded
    courses_to_schedule = []
    for sel in selected_courses:
        code = sel["course_code"]
        if code == "_meta" or code not in raw_catalog:
            continue
        data     = raw_catalog[code]
        families = group_sections_by_family(data.get("availability", []))
        if not families:
            print(f"   No open section families for {code} — skipping")
            continue

        # Expand each family into all LEC×linked combos
        all_combos = []
        for fam in families:
            all_combos.extend(build_section_combos(fam))

        if not all_combos:
            print(f"   No valid section combos for {code} — skipping")
            continue

        print(f"   {code}: {len(families)} lecture(s), {len(all_combos)} total section combos")
        courses_to_schedule.append({
            "code":             code,
            "title":            sel.get("course_title", data.get("course_title", "")),
            "credits":          sel.get("credits", data.get("credits", 0)),
            "workload_percent": sel.get("workload_percent",
                                        data.get("metrics", {}).get("workload_percent", "N/A")),
            "combos":           all_combos,   # list of (lec_sec, [linked_secs])
        })

    # Start with preference blocks as pre-occupied time
    occupied = list(preference_blocks)
    chosen   = []

    def first_conflict(new_blocks: list):
        """Return a conflict description string, or None if no conflict."""
        for nb in new_blocks:
            for ob in occupied:
                if nb.conflicts_with(ob):
                    return f"{nb.label} vs {ob.label}"
        return None

    def backtrack(idx: int) -> bool:
        if idx == len(courses_to_schedule):
            return True

        course = courses_to_schedule[idx]

        for (lec, linked_secs) in course["combos"]:
            # Collect TimeBlocks for this specific LEC + linked combo
            new_blocks = []
            for sec in [lec] + linked_secs:
                new_blocks.extend(section_to_timeblocks(sec, course["code"]))

            # Only skip TBA combos if other real-time options exist
            has_times = any(new_blocks)
            if not has_times:
                total_combos = len(course["combos"])
                if total_combos > 1:
                    continue  # skip TBA; better options exist
                # Only combo and it's TBA — accept it (online/async course)

            conflict = first_conflict(new_blocks)
            if conflict:
                continue

            # Commit
            occupied.extend(new_blocks)
            chosen.append({
                "course_code":      course["code"],
                "course_title":     course["title"],
                "credits":          course["credits"],
                "workload_percent": course["workload_percent"],
                "lecture_section":  slim_section_for_ai(lec),
                "linked_sections":  [slim_section_for_ai(s) for s in linked_secs],
                "_timeblocks":      new_blocks,
            })

            if backtrack(idx + 1):
                return True

            # Backtrack
            del occupied[-len(new_blocks):]
            chosen.pop()

        return False  # No valid combo found for this course

    success = backtrack(0)

    if success:
        total_credits = sum(c["credits"] for c in chosen)
        workloads     = []
        for c in chosen:
            try:
                workloads.append(float(c["workload_percent"]))
            except (ValueError, TypeError):
                pass
        avg_workload = round(sum(workloads) / len(workloads), 1) if workloads else 0

        clean = [{k: v for k, v in c.items() if k != "_timeblocks"} for c in chosen]

        # Bubble advisory warnings into the final schedule entries
        for entry in clean:
            code = entry.get("course_code", "")
            adv  = raw_catalog.get(code, {}).get("advisory_warnings", [])
            if adv:
                entry["advisory_prereq_warnings"] = adv

        return {
            "success":          True,
            "schedule":         clean,
            "total_credits":    total_credits,
            "average_workload": avg_workload,
        }
    else:
        # Identify which course(s) actually got stuck by re-running with diagnostics.
        # A course is "the problem" if it has zero combos that avoid ALL preference
        # blocks alone (before even considering other courses).
        pref_only = list(preference_blocks)
        truly_stuck = []
        for course in courses_to_schedule:
            any_fits = False
            for (lec, linked_secs) in course["combos"]:
                blocks = []
                for sec in [lec] + linked_secs:
                    blocks.extend(section_to_timeblocks(sec, course["code"]))
                if not any(any(b.conflicts_with(p) for p in pref_only) for b in blocks):
                    any_fits = True
                    break
            if not any_fits:
                truly_stuck.append(course["code"])

        # If we can pinpoint stuck courses, report only those; else report all
        reported = truly_stuck if truly_stuck else [c["code"] for c in courses_to_schedule]
        return {
            "success":      False,
            "conflicts":    reported,
            "all_selected": [c["code"] for c in courses_to_schedule],
            "message": (
                f"Courses with no valid sections given time constraints: {reported}"
                if truly_stuck else
                f"No conflict-free combination found among: {reported}"
            ),
        }


# =============================================================================
# STEP 7 - ORCHESTRATOR WITH FEEDBACK LOOP
# =============================================================================

def build_schedule_with_ai(user_profile: dict, rules_db: list, catalog_db: dict) -> dict:
    print("Initializing AI Schedule Optimizer...\n")

    # --- Locate major rules ---
    user_major = user_profile.get("major")
    matches    = [p for p in rules_db if p.get("program_name") == user_major]
    if not matches:
        print(f"No rules found for '{user_major}'")
        major_rules = {}
    else:
        major_rules = next((p for p in matches if p.get("academic_year")), matches[0])
        if len(matches) > 1:
            print(f"   {len(matches)} entries for '{user_major}', "
                  f"using academic_year='{major_rules.get('academic_year', 'N/A')}'")

    # --- Pre-filter catalog (pure Python, no AI) ---
    print("Pre-filtering catalog...")
    filtered_catalog = pre_filter_catalog(user_profile, major_rules, catalog_db)
    if not filtered_catalog:
        return {"error": "No eligible courses found for this student."}

    # --- Build preference blocks once (they never change between rounds) ---
    print("\nBuilding time preference blocks...")
    preference_blocks = build_preference_blocks(user_profile.get("preferences", {}))
    if not preference_blocks:
        print("   No preference blocks (all times open)")

    # --- Feedback loop ---
    conflicting_courses = None
    previously_failed   = []

    for attempt in range(1, MAX_RETRY_ROUNDS + 1):
        print(f"\n{'='*55}")
        print(f"Round {attempt} - Asking Gemini to select courses...")

        ai_result  = gemini_select_courses(user_profile, filtered_catalog, conflicting_courses)
        selections = ai_result.get("selections", [])

        if not selections:
            print("   Gemini returned no selections. Stopping.")
            break

        selected_codes = frozenset(s["course_code"] for s in selections)
        print(f"   Gemini selected: {sorted(selected_codes)}")

        # Guard against infinite loop (Gemini keeps picking the same broken set)
        if selected_codes in previously_failed:
            print("   Gemini is repeating a previously failed course set. Stopping.")
            break
        previously_failed.append(selected_codes)

        print("Running backtracking scheduler...")
        result = find_valid_schedule(selections, filtered_catalog, preference_blocks)

        if result["success"]:
            print(f"\nValid schedule found on attempt {attempt}!")
            result["attempt"]  = attempt
            result["ai_notes"] = ai_result.get("notes", "")
            # prereqs enforced by Gemini during selection — no separate blocked list
            result["active_preference_blocks"] = [
                {
                    "label": b.label,
                    "days":  sorted(b.days),
                    "start": str(b.start),
                    "end":   str(b.end),
                }
                for b in preference_blocks
            ]
            return result
        else:
            print(f"   Conflict detected: {result['conflicts']}")
            print(f"   Telling Gemini to avoid: {result['conflicts']}")
            conflicting_courses = result["conflicts"]

    return {
        "success":        False,
        "error":          f"Could not build a valid schedule after {MAX_RETRY_ROUNDS} attempts.",
        "last_conflicts": conflicting_courses,
    }


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    rules   = load_json_db("master.json")
    catalog = load_json_db("unified_catalog_test.json")

    test_user = {
        "major": "Computer Engineering",
        "completed_courses": [
            "MATH 115", "MATH 116", "ENGR 100", "ENGR 101",
            "CHEM 130", "CHEM 125", "CHEM 126",
        ],
        "target_credits_this_term": 16,
        "preferences": {
            "max_workload_percent_per_class": 80,
            "avoid_mornings": True,   # blocks 12:00 AM - 10:00 AM, Mon-Fri
            "free_fridays":   True,   # blocks all day Friday
            # Optional custom blocks:
            # "custom_blocks": [
            #     {
            #         "label": "No Wednesday afternoons",
            #         "days":  ["We"],
            #         "start": "12:00",
            #         "end":   "17:00"
            #     }
            # ]
        },
    }

    final = build_schedule_with_ai(test_user, rules, catalog)

    print("\n" + "="*55)
    print("FINAL SCHEDULE:\n")
    print(json.dumps(final, indent=4, default=str))