import os
import csv
import json
import time
import re
import requests
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

# --- Configuration ---
WORKLOAD_CSV_FILE = "umich_atlas_workload_checkpoint_p130.csv" # Your specific CSV file
UNIFIED_CATALOG_FILE = "unified_catalog.json"
TARGET_TERM_CODE = "2510"  # UM Term Code (e.g., 2510 = Fall 2024, 2520 = Winter 2025)

# --- UMich API Endpoints ---
UM_API_BASE_URL = "https://gw.api.it.umich.edu/um/Curriculum/SOC"
TOKEN_URL = "https://gw.api.it.umich.edu/um/oauth2/token"
UM_CLIENT_ID = os.getenv("UM_CLIENT_ID")
UM_CLIENT_SECRET = os.getenv("UM_CLIENT_SECRET")

def load_workload_csv(filepath):
    """Reads the CSV, fixes formatting, and creates a standardized dictionary."""
    print(f"📊 Loading Workload CSV from '{filepath}'...")
    workload_db = {}
    
    try:
        with open(filepath, mode='r', encoding='utf-8-sig') as file:
            reader = csv.DictReader(file)
            for row in reader:
                # 1. Grab the raw code (e.g., "AAS103")
                raw_code = row.get("Course Code", "").strip().upper()
                
                # 2. Inject a space to standardize it (e.g., "AAS 103")
                match = re.match(r"([A-Z]+)([0-9]+)", raw_code)
                if match:
                    standard_code = f"{match.group(1)} {match.group(2)}"
                else:
                    standard_code = raw_code

                if standard_code:
                    workload_db[standard_code] = {
                        "workload_percent": row.get("Workload %", "N/A"),
                        "course_name": row.get("Course Name", "").strip()
                    }
        print(f"  ✅ Successfully loaded {len(workload_db)} courses from CSV.")
        return workload_db
    except Exception as e:
        print(f"  ❌ Error reading CSV: {e}")
        return {}

def get_um_access_token():
    """Authenticates with the UMich API to get a temporary Bearer token."""
    print("🔑 Authenticating with UMich servers...")
    
    payload = {
        "grant_type": "client_credentials",
        "scope": "umscheduleofclasses"
    }
    
    try:
        # requests automatically handles the Base64 encoding required by the API
        response = requests.post(
            TOKEN_URL, 
            data=payload, 
            auth=(UM_CLIENT_ID, UM_CLIENT_SECRET),
            timeout=10
        )
        
        if response.status_code == 401:
            print("  ❌ 401 Unauthorized.")
            print("     -> Check that your UM_CLIENT_ID and UM_CLIENT_SECRET are correct.")
            print("     -> Ensure you clicked 'Subscribe' on the UMScheduleOfClasses API in the UM portal.")
            exit(1)
            
        response.raise_for_status()
        print("  ✅ Access token successfully generated!")
        return response.json().get("access_token")
        
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Authentication failed: {e}")
        exit(1)

def fetch_um_schedule_api(workload_db):
    """Fetches real-time class data, only querying courses found in the workload CSV."""
    access_token = get_um_access_token()
    print(f"🌐 Fetching live UMich API data for Term {TARGET_TERM_CODE}...")
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    
    api_database = []
    
    for course_code in workload_db.keys():
        parts = course_code.split(" ")
        if len(parts) != 2:
            continue
            
        subject = parts[0]
        catalog_nbr = parts[1]
        
        # UM API Search Query
        criteria = f"SubjectCode={subject}&CatalogNbr={catalog_nbr}"
        search_url = f"{UM_API_BASE_URL}/Terms/{TARGET_TERM_CODE}/Classes/Search/{criteria}"
        
        try:
            response = requests.get(search_url, headers=headers, timeout=10)
            
            if response.status_code == 404:
                # Class isn't offered this term, skip silently or log it
                continue
                
            response.raise_for_status()
            search_results = response.json()
            
            # Extract the actual class arrays
            classes = search_results.get("Classes", search_results)
            if not isinstance(classes, list):
                classes = [classes]
                
            for class_data in classes: 
                course_record = {
                    "SubjectCode": class_data.get("SubjectCode"),
                    "CatalogNumber": class_data.get("CatalogNumber"),
                    "CourseTitle": class_data.get("CourseDescr", class_data.get("CourseTitle", "")),
                    "CreditHours": class_data.get("Units", 0),
                    "CourseDescription": class_data.get("CourseDescription", "No description provided."),
                    "Sections": []
                }
                
                # Extract specific section and seating data
                for sec in class_data.get("Sections", []):
                    section_record = {
                        "SectionNumber": sec.get("SectionNumber"),
                        "Component": sec.get("InstructionMode", sec.get("Component", "LEC")),
                        "AvailableSeats": sec.get("AvailableSeats", 0),
                        "EnrollmentTotal": sec.get("EnrollmentTotal", 0),
                        "EnrollmentCapacity": sec.get("EnrollmentCapacity", 0),
                        "Status": "Open" if int(sec.get("AvailableSeats", 0)) > 0 else "Closed/Waitlisted",
                        "Meetings": []
                    }
                    
                    for meet in sec.get("Meetings", []):
                        section_record["Meetings"].append({
                            "Days": meet.get("Days", ""),
                            "StartTime": meet.get("StartTime", ""),
                            "EndTime": meet.get("EndTime", ""),
                            "Location": meet.get("LocationDescr", meet.get("Location", "TBA")),
                            "Instructor": meet.get("InstructorName", "Staff")
                        })
                        
                    course_record["Sections"].append(section_record)
                
                api_database.append(course_record)
                print(f"  ✅ Fetched API Data: {course_code} ({len(course_record['Sections'])} sections)")
                
            # Sleep briefly to avoid UM API rate limits
            time.sleep(0.1) 

        except requests.exceptions.RequestException as e:
            print(f"  ⚠️ Warning: API Error for {course_code}: {e}")
            
    return api_database

def build_unified_catalog():
    print("🚀 Building Master Course Catalog...")
    
    # 1. Load CSV
    workload_data = load_workload_csv(WORKLOAD_CSV_FILE)
    if not workload_data:
        print("  ❌ Stopping. No workload data found.")
        return
        
    # 2. Fetch API Data
    api_data = fetch_um_schedule_api(workload_data)
    
    # 3. Merge them based on our Primary Key ("Subject CatalogNbr")
    unified_catalog = {}
    
    print("🔄 Merging datasets...")
    for course in api_data:
        subj = course.get("SubjectCode", "").upper()
        num = str(course.get("CatalogNumber", "")).upper()
        course_code = f"{subj} {num}"
        
        # Grab the CSV metrics for this exact course
        matched_workload = workload_data.get(course_code, {"workload_percent": "N/A"})
        
        unified_catalog[course_code] = {
            "course_code": course_code,
            "course_title": course.get("CourseTitle", ""),
            "course_description": course.get("CourseDescription", ""),
            "credits": course.get("CreditHours", 0),
            "term": TARGET_TERM_CODE,
            "metrics": {
                "workload_percent": matched_workload["workload_percent"]
            },
            "availability": course.get("Sections", [])
        }

    # 4. Save the finalized JSON Database
    with open(UNIFIED_CATALOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(unified_catalog, f, indent=4)
        
    print(f"🎉 SUCCESS! Unified database saved to {UNIFIED_CATALOG_FILE}!")
    print(f"   Total courses in database: {len(unified_catalog)}")

if __name__ == "__main__":
    build_unified_catalog()