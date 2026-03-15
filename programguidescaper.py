import os
import json
import PyPDF2
from jsonschema import validate, ValidationError
from dotenv import load_dotenv
from google import genai
from google.genai import types 

# 1. Load the variables (Project ID)
load_dotenv()

project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")
location = "us-central1" 

# --- THE BULLETPROOF FIX ---
# Hardcode the expansion of the default macOS gcloud credentials path
# and force it into the environment variables BEFORE initializing the client.
adc_path = os.path.expanduser("~/.config/gcloud/application_default_credentials.json")

if not os.path.exists(adc_path):
    print(f"🚨 CRITICAL: Could not find ADC file at {adc_path}")
    print("Please run: gcloud auth application-default login")
    exit(1)

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = adc_path
print(f"DEBUG: Forced ADC credentials from: {adc_path}")
# ---------------------------

# 2. Initialize the client for Vertex AI
client = genai.Client(
    vertexai=True,
    project=project_id,
    location=location
)

print(f"DEBUG: Initialized Vertex AI Client for project: {project_id}")

UNIVERSAL_PROGRAM_SCHEMA = {
    "type": "object",
    "properties": {
        "program_name": {"type": "string", "description": "e.g., Computer Engineering, Data Science, Spanish Minor"},
        "program_type": {"type": "string", "enum": ["Major", "Minor", "Certificate", "Unknown"]},
        "college": {"type": "string", "description": "e.g., College of Engineering, LSA, Ross"},
        "academic_year": {"type": "string", "description": "The academic year or effective date of this guide, e.g., '2025-2026', 'Fall 2024'."},
        "overall_total_credits": {"type": "integer"},
        
        # Here is the magic: A dynamic list of requirement blocks
        "requirement_blocks": {
            "type": "array",
            "description": "Break down the program into its distinct requirement categories (e.g., 'Core Courses', 'Intellectual Breadth', 'Prerequisites', 'Upper-Level Electives').",
            "items": {
                "type": "object",
                "properties": {
                    "block_name": {"type": "string", "description": "The name of this specific requirement section."},
                    "credits_required_for_block": {"type": "integer"},
                    "courses_required_for_block": {"type": "integer", "description": "Number of classes needed, if specified instead of credits."},
                    "mandatory_courses": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific course codes that MUST be taken (e.g., ['EECS 280', 'MATH 115'])."
                    },
                    "elective_options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "A list of course codes the student can choose from to satisfy this block."
                    },
                    "rules_and_restrictions": {
                        "type": "string",
                        "description": "Any plain-text rules, like 'Must take at least two 400-level courses' or 'No more than 3 credits from independent study'."
                    }
                },
                "required": ["block_name"]
            }
        }
    },
    "required": ["program_name", "program_type", "college", "academic_year", "requirement_blocks"]
}

# --- HELPER FUNCTIONS ---

def prepare_document_for_gemini(file_path):
    """Reads the raw file bytes and identifies the MIME type."""
    ext = os.path.splitext(file_path)[1].lower()
    
    mime_types = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain'
    }
    
    mime_type = mime_types.get(ext)
    
    if not mime_type:
        print(f"  [Error] Unsupported file type: {ext}")
        return None, None

    try:
        with open(file_path, 'rb') as f:
            document_bytes = f.read()
        return document_bytes, mime_type
    except Exception as e:
        print(f"  [Error] Reading {file_path}: {e}")
        return None, None

def parse_guide_with_gemini(document_bytes, mime_type):
    """Sends the raw document and prompt to Gemini."""
    
    system_prompt = """
    You are a precision-driven Academic Data Extraction Architect. Your sole purpose is to convert unstructured university program guides into a strictly formatted JSON database.

    CRITICAL RULES YOU MUST FOLLOW ABSOLUTELY:

    1. NO SHORTHAND OR GROUPED COURSE CODES: 
       You must NEVER group courses using slashes, hyphens, commas, or ampersands. Every single course must be separated into its full "SUBJECT NUMBER" format.
       - INCORRECT: "CHEM 130/125/126"
       - CORRECT: ["CHEM 130", "CHEM 125", "CHEM 126"]
       - INCORRECT: "PHYSICS 140 & 141"
       - CORRECT: ["PHYSICS 140", "PHYSICS 141"]
       - INCORRECT: "MATH 115, 116, 215"
       - CORRECT: ["MATH 115", "MATH 116", "MATH 215"]

    2. STRICT "AND" vs "OR" LOGIC:
       - AND (Co-requisites/Mandatory): If a student MUST take multiple courses together, list them as completely separate string entries in the `mandatory_courses` array.
       - OR (Alternatives): If a student can choose between courses (e.g., "Take MATH 115 or MATH 120"), place both full course codes in the `elective_options` array.

    3. STANDARDIZE SUBJECT NAMES:
       Always capitalize the subject code. Do not spell out the department if an acronym is provided in the text.
       - Use "EECS 280", not "Eecs 280" or "Electrical Engineering and Computer Science 280".

    4. EXPLICIT CREDIT COUNTS:
       If a block requires a specific number of credits (e.g., "Choose 12 credits of Technical Electives"), assign the integer 12 to `credits_required_for_block`. Do not guess or average credits if they are not explicitly stated.

    5. NO HALLUCINATIONS:
       Only extract courses and rules that physically exist in the provided document. If a section is missing, leave the arrays empty.
       
    6. IDENTIFY THE ACADEMIC YEAR:
       Hunt for the effective date, catalog year, or academic year (e.g., "2025-2026" or "Effective Fall 2025"). Extract this exactly as written into the `academic_year` field. If no date is found, output "Unknown Year".

    Break the curriculum down into distinct `requirement_blocks` (e.g., "Prerequisites", "Core Requirements", "General Electives"). Your output MUST strictly adhere to the provided JSON schema.
    """

    # Package the raw file bytes into a Gemini Part object
    document_part = types.Part.from_bytes(
        data=document_bytes,
        mime_type=mime_type
    )

    print(f"    [LLM] Analyzing raw document (MIME: {mime_type})...")
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        # We pass a list containing the document AND the instructions
        contents=[
            document_part, 
            "Extract the curriculum requirements from this document into the required JSON structure."
        ],
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=UNIVERSAL_PROGRAM_SCHEMA,
            temperature=0.1
        )
    )
    
    data = json.loads(response.text)
    validate(instance=data, schema=UNIVERSAL_PROGRAM_SCHEMA)
    return data

# --- MAIN BATCH PROCESSOR ---

def main(input_folder, output_folder):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # Get list of supported files
    supported_extensions = ('.pdf', '.docx', '.txt')
    files_to_process = [f for f in os.listdir(input_folder) if f.lower().endswith(supported_extensions)]

    print(f"🚀 Starting batch process: {len(files_to_process)} files found.")

    for filename in files_to_process:
        print(f"📄 Processing: {filename}...")
        file_path = os.path.join(input_folder, filename)
        
        # 1. Extract
        doc_bytes, mime_type = prepare_document_for_gemini(file_path)
        if not doc_bytes:
            continue
            
        try:
            # 2. Parse & Validate
            structured_json = parse_guide_with_gemini(doc_bytes, mime_type)
            
            # 3. Save
            output_filename = os.path.splitext(filename)[0] + ".json"
            output_path = os.path.join(output_folder, output_filename)
            
            with open(output_path, 'w') as f:
                json.dump(structured_json, f, indent=2)
            
            print(f"  ✅ Successfully saved to {output_filename}")

        except ValidationError as ve:
            print(f"  ❌ Validation failed for {filename}: {ve.message}")
        except Exception as e:
            print(f"  ❌ LLM Error for {filename}: {e}")

if __name__ == "__main__":
    # Specify your folders here
    INPUT_DIR = "./my_guides"    # Folder containing your PDFs/DOCX
    OUTPUT_DIR = "./results"      # Folder where JSONs will be saved
    
    # Make sure the input folder exists for the demo
    if not os.path.exists(INPUT_DIR):
        os.makedirs(INPUT_DIR)
        print(f"Created '{INPUT_DIR}' folder. Please drop your files there and run again.")
    else:
        main(INPUT_DIR, OUTPUT_DIR)