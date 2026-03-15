import os
import csv
import json
import time
import re
import requests
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
WORKLOAD_CSV_FILE = "atlas1.csv"
UNIFIED_CATALOG_FILE = "winter_2026_catalog_batch1.json"
TARGET_TERM_CODE = "2570"

# --- UMich API Endpoints ---
UM_API_BASE_URL = "https://gw.api.it.umich.edu/um/Curriculum/SOC"
TOKEN_URL = "https://gw.api.it.umich.edu/um/oauth2/token"
UM_CLIENT_ID = os.getenv("UM_CLIENT_ID")
UM_CLIENT_SECRET = os.getenv("UM_CLIENT_SECRET")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def get_um_access_token():
    """Authenticates with the UMich API to get a temporary Bearer token."""
    print("🔑 Authenticating with UMich servers...")
    payload = {"grant_type": "client_credentials", "scope": "umscheduleofclasses"}
    try:
        response = requests.post(
            TOKEN_URL,
            data=payload,
            auth=(UM_CLIENT_ID, UM_CLIENT_SECRET),
            timeout=10,
        )
        if response.status_code == 401:
            print("  ❌ 401 Unauthorized. Check UM_CLIENT_ID / UM_CLIENT_SECRET and portal subscription.")
            exit(1)
        response.raise_for_status()
        print("  ✅ Access token obtained.")
        return response.json().get("access_token")
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Authentication failed: {e}")
        exit(1)


# ---------------------------------------------------------------------------
# Build a subject → school-code lookup
# ---------------------------------------------------------------------------

def build_subject_school_map(headers):
    """
    Walks /Terms/{term}/Schools → /Schools/{code}/Subjects to produce
    a dict like {"MATH": "LS", "EECS": "ENG", ...}.

    This is required because the Sections endpoint is nested under SchoolCode.
    """
    print(f"🗺  Building subject→school map for term {TARGET_TERM_CODE}...")
    subject_to_school = {}

    schools_url = f"{UM_API_BASE_URL}/Terms/{TARGET_TERM_CODE}/Schools"
    try:
        r = requests.get(schools_url, headers=headers, timeout=10)
        r.raise_for_status()
        schools_data = r.json().get("getSOCSchoolsResponse", {}).get("School", [])
        if not isinstance(schools_data, list):
            schools_data = [schools_data]
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Could not fetch school list: {e}")
        return subject_to_school

    for school in schools_data:
        school_code = school.get("SchoolCode", "").strip()
        if not school_code:
            continue

        subjects_url = f"{UM_API_BASE_URL}/Terms/{TARGET_TERM_CODE}/Schools/{school_code}/Subjects"
        try:
            r = requests.get(subjects_url, headers=headers, timeout=10)
            if r.status_code == 404:
                continue
            r.raise_for_status()
            subjects = r.json().get("getSOCSubjectsResponse", {}).get("Subject", [])
            if not isinstance(subjects, list):
                subjects = [subjects]
            for subj in subjects:
                subj_code = subj.get("SubjectCode", "").strip().upper()
                if subj_code:
                    subject_to_school[subj_code] = school_code
            time.sleep(0.2)
        except requests.exceptions.RequestException:
            continue

    print(f"  ✅ Mapped {len(subject_to_school)} subjects across {len(schools_data)} schools.")
    return subject_to_school


# ---------------------------------------------------------------------------
# CSV loader
# ---------------------------------------------------------------------------

def load_workload_csv(filepath):
    """
    Reads the CSV and returns a dict keyed by standardised course code (e.g. 'AAS 103').
    Captures workload, course name, and advisory/enforced prerequisites from the same file.
    """
    print(f"📊 Loading course data from '{filepath}'...")
    workload_db = {}
    try:
        with open(filepath, mode="r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                raw_code = row.get("Course Code", "").strip().upper()
                match = re.match(r"([A-Z]+)\s*([0-9]+)", raw_code)
                if match:
                    standard_code = f"{match.group(1)} {match.group(2)}"
                else:
                    standard_code = raw_code
                if standard_code:
                    workload_db[standard_code] = {
                        "workload_percent": row.get("Workload %", "N/A"),
                        "course_name": row.get("Course Name", "").strip(),
                        "advisory_prereqs": row.get("Advisory Prerequisites", "").strip(),
                        "enforced_prereqs": row.get("Enforced Prerequisites", "").strip(),
                    }
        print(f"  ✅ Loaded {len(workload_db)} courses.")
        return workload_db
    except Exception as e:
        print(f"  ❌ Error reading CSV: {e}")
        return {}


# ---------------------------------------------------------------------------
# Fetch sections for one course
# ---------------------------------------------------------------------------

def fetch_sections(subject, catalog_nbr, school_code, headers):
    """
    Calls:
      GET /Terms/{term}/Schools/{school}/Subjects/{subject}/CatalogNbrs/{nbr}/Sections?IncludeAllSections=Y

    Returns a list of normalised section dicts (empty list on failure/404).
    """
    url = (
        f"{UM_API_BASE_URL}/Terms/{TARGET_TERM_CODE}"
        f"/Schools/{school_code}/Subjects/{subject}/CatalogNbrs/{catalog_nbr}/Sections"
    )
    params = {"IncludeAllSections": "Y"}

    try:
        r = requests.get(url, headers=headers, params=params, timeout=10)
        if r.status_code == 404:
            return []
        r.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"  ⚠️  Request error for {subject} {catalog_nbr}: {e}")
        return []

    raw = r.json().get("getSOCSectionsResponse", {})
    sections_raw = raw.get("Section", [])
    if not isinstance(sections_raw, list):
        sections_raw = [sections_raw]

    sections = []
    for sec in sections_raw:
        enrollment_status = sec.get("EnrollmentStatus", "").lower()
        available = sec.get("AvailableSeats", 0)

        meeting_raw = sec.get("Meeting", {})
        meetings = []
        if meeting_raw:
            if not isinstance(meeting_raw, list):
                meeting_raw = [meeting_raw]
            for m in meeting_raw:
                meetings.append({
                    "Days": m.get("Days", ""),
                    "Times": m.get("Times", "TBA"),
                    "Location": m.get("Location", "TBA"),
                    "Instructor": m.get("Instructors", "Staff"),
                    "StartDate": m.get("StartDate", ""),
                    "EndDate": m.get("EndDate", ""),
                })

        instructors_raw = sec.get("ClassInstructors", [])
        if not isinstance(instructors_raw, list):
            instructors_raw = [instructors_raw]
        instructors = [i.get("InstrName", "") for i in instructors_raw if i]

        sections.append({
            "SectionNumber": sec.get("SectionNumber"),
            "SectionType": sec.get("SectionType", ""),
            "SectionTypeDescr": sec.get("SectionTypeDescr", ""),
            "InstructionMode": sec.get("InstructionMode", ""),
            "ClassNumber": sec.get("ClassNumber"),
            "CreditHours": sec.get("CreditHours", 0),
            "EnrollmentStatus": enrollment_status,
            "EnrollmentTotal": sec.get("EnrollmentTotal", 0),
            "EnrollmentCapacity": sec.get("EnrollmentCapacity", 0),
            "AvailableSeats": available,
            "WaitTotal": sec.get("WaitTotal", 0),
            "WaitCapacity": sec.get("WaitCapacity", 0),
            "Status": "Open" if enrollment_status == "open" else "Closed/Waitlisted",
            "Instructors": instructors,
            "Meetings": meetings,
        })

    return sections


# ---------------------------------------------------------------------------
# Course description lookup (optional enrichment)
# ---------------------------------------------------------------------------

def fetch_course_description(subject, catalog_nbr, school_code, headers):
    """
    Calls:
      GET /Terms/{term}/Schools/{school}/Subjects/{subject}/CatalogNbrs/{nbr}

    Returns the CourseDescr string, or empty string on failure.
    """
    url = (
        f"{UM_API_BASE_URL}/Terms/{TARGET_TERM_CODE}"
        f"/Schools/{school_code}/Subjects/{subject}/CatalogNbrs/{catalog_nbr}"
    )
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 404:
            return ""
        r.raise_for_status()
        return r.json().get("getSOCCourseDescrResponse", {}).get("CourseDescr", "")
    except requests.exceptions.RequestException:
        return ""


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def build_unified_catalog():
    print("🚀 Building Master Course Catalog...\n")

    workload_data = load_workload_csv(WORKLOAD_CSV_FILE)
    if not workload_data:
        print("  ❌ Stopping — no workload data found.")
        return

    headers = {
        "Authorization": f"Bearer {get_um_access_token()}",
        "Accept": "application/json",
    }

    subject_to_school = build_subject_school_map(headers)

    print(f"\n🌐 Fetching section data for {len(workload_data)} courses in term {TARGET_TERM_CODE}...\n")
    unified_catalog = {}

    for course_code, course_info in workload_data.items():
        parts = course_code.split(" ")
        if len(parts) != 2:
            print(f"  ⚠️  Skipping malformed course code: '{course_code}'")
            continue

        subject, catalog_nbr = parts[0], parts[1]
        school_code = subject_to_school.get(subject)

        if not school_code:
            print(f"  ⚠️  No school found for subject '{subject}' — skipping {course_code}")
            continue

        sections = fetch_sections(subject, catalog_nbr, school_code, headers)

        if not sections:
            print(f"  ⚠️  No sections found for {course_code} this term.")
        else:
            print(f"  ✅ {course_code} — {len(sections)} section(s) fetched")

        course_descr = fetch_course_description(subject, catalog_nbr, school_code, headers)

        credits = next(
            (s["CreditHours"] for s in sections if s.get("CreditHours")), 0
        )

        unified_catalog[course_code] = {
            "course_code": course_code,
            "course_title": course_info.get("course_name", ""),
            "course_description": course_descr,
            "credits": credits,
            "school_code": school_code,
            "term": TARGET_TERM_CODE,
            "metrics": {
                "workload_percent": course_info["workload_percent"],
            },
            "prerequisites": {
                "advisory": course_info["advisory_prereqs"],
                "enforced": course_info["enforced_prereqs"],
            },
            "availability": sections,
        }

        time.sleep(0.3)

    with open(UNIFIED_CATALOG_FILE, "w", encoding="utf-8") as f:
        json.dump(unified_catalog, f, indent=4)

    print(f"\n🎉 Done! Catalog saved to '{UNIFIED_CATALOG_FILE}'")
    print(f"   Total courses: {len(unified_catalog)}")


if __name__ == "__main__":
    build_unified_catalog()