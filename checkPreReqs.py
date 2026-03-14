import os
import json
import google.generativeai as genai

def check_umich_prereqs(course_code: str, api_key: str) -> dict:
    """
    Queries the Gemini API to check prerequisites for a UMich course.
    Returns JSON with 'Y' or 'N' for has_prerequisites, and uses null 
    ONLY when the prerequisite information is unknown.
    """
    # Configure the Gemini API key
    genai.configure(api_key=api_key)
    
    # Initialize the model 
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    # Updated Prompt: Strict rules for Y/N, "None", and null
    prompt = f"""
    You are an academic advisor at the University of Michigan. 
    Identify if the course '{course_code}' has any enforced prerequisites. 
    
    CRITICAL INSTRUCTIONS:
    1. Rely ONLY on factual, known data regarding University of Michigan courses. NEVER make information up or guess.
    2. The "has_prerequisites" field MUST be strictly "Y" or "N".
    3. If there are NO prerequisites (has_prerequisites is "N"), set "enforced_prerequisites" to the string "None".
    4. ONLY if you do not know or cannot confidently verify the prerequisites, set "enforced_prerequisites" strictly to null.
    
    Output your response using this exact JSON schema:
    {{
      "course_code": "{course_code}",
      "has_prerequisites": "Y or N",
      "enforced_prerequisites": "The list of enforced prerequisites, 'None', or null"
    }}
    """
    
    # Generate the response, forcing valid JSON output
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json"
        )
    )
    
    # Parse the returned JSON string
    try:
        result_dict = json.loads(response.text)
        return result_dict
    except json.JSONDecodeError:
        return {"error": "Failed to parse JSON response."}

# ==========================================
# Example Usage
# ==========================================
if __name__ == "__main__":
    MY_API_KEY = "YOUR_GEMINI_API_KEY" 
    
    # Testing the three specific scenarios:
    # 1. Has prereqs (Y / list)
    # 2. No prereqs (N / "None")
    # 3. Unknown course (N or Y / null)
    courses_to_check = ["EECS 281", "ENGLISH 125", "FAKE 999"]
    
    for course in courses_to_check:
        try:
            print(f"Checking {course}...")
            result = check_umich_prereqs(course, MY_API_KEY)
            print(json.dumps(result, indent=4))
            print("-" * 20)
        except Exception as e:
            print(f"An error occurred for {course}: {e}")