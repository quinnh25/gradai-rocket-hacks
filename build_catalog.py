import csv
import json

# --- Configuration ---
WORKLOAD_CSV_FILE = "workload.csv"           # The path to your CSV file
UNIFIED_CATALOG_FILE = "unified_catalog.json" # The output database for the AI

def load_workload_csv(filepath):
    """Reads the CSV and creates a dictionary keyed by 'course code'."""
    print("📊 Loading Workload CSV...")
    workload_db = {}
    
    try:
        with open(filepath, mode='r', encoding='utf-8-sig') as file:
            reader = csv.DictReader(file)
            
            for row in reader:
                # Clean up the key just in case there are extra spaces (e.g. " EECS 280 ")
                course_code = row.get("course code", "").strip().upper()
                
                if course_code:
                    workload_db[course_code] = {
                        "workload_percent": row.get("workload %", "Unknown"),
                        # We don't really need subject/number since course_code has both,
                        # but we can grab the name just to have it!
                        "course_name_from_csv": row.get("course name", "").strip()
                    }
        print(f"  ✅ Loaded {len(workload_db)} courses from CSV.")
        return workload_db
    except Exception as e:
        print(f"  ❌ Error reading CSV: {e}")
        return {}

def fetch_um_schedule_api():
    """
    TODO: Replace this mock data with your actual UM Schedule of Classes API call!
    Using the 'requests' library to hit their endpoint and return the JSON list.
    """
    print("🌐 Fetching UM Schedule of Classes API...")
    
    # Mocking what the API might return for this term
    mock_api_response = [
        {
            "SubjectCode": "EECS",
            "CatalogNumber": "280",
            "CourseTitle": "Prog&Data Struct",
            "CreditHours": 4,
            "Term": "Fall 2026",
            "Sections": [{"Section": "001", "Status": "Open", "Time": "10:30-12:00"}]
        },
        {
            "SubjectCode": "MATH",
            "CatalogNumber": "115",
            "CourseTitle": "Calculus I",
            "CreditHours": 4,
            "Term": "Fall 2026",
            "Sections": [{"Section": "010", "Status": "Waitlisted", "Time": "8:30-10:00"}]
        }
    ]
    
    return mock_api_response

def build_unified_catalog():
    print("🚀 Building Master Course Catalog...")
    
    # 1. Get the CSV data
    workload_data = load_workload_csv(WORKLOAD_CSV_FILE)
    
    # 2. Get the API data
    api_data = fetch_um_schedule_api()
    
    unified_catalog = {}

    # 3. Merge them together!
    for course in api_data:
        # Construct the primary key to match the CSV (e.g., "EECS" + " " + "280")
        subj = course.get("SubjectCode", "").upper()
        num = str(course.get("CatalogNumber", "")).upper()
        course_code = f"{subj} {num}"
        
        # Look up this course in our workload dictionary
        matched_workload = workload_data.get(course_code, {"workload_percent": "N/A"})
        
        # Build the unified record
        unified_catalog[course_code] = {
            "course_code": course_code,
            "course_title": course.get("CourseTitle", ""),
            "credits": course.get("CreditHours", 0),
            "term": course.get("Term", "Unknown"),
            "availability": course.get("Sections", []),
            "metrics": {
                "workload_percent": matched_workload["workload_percent"]
            }
        }

    # 4. Save to disk
    with open(UNIFIED_CATALOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(unified_catalog, f, indent=4)
        
    print(f"✅ Master Course Catalog saved to {UNIFIED_CATALOG_FILE}!")

if __name__ == "__main__":
    build_unified_catalog()