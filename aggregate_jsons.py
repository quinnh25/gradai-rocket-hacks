import os
import json
import shutil

# --- Configuration ---
NEW_JSON_DIR = "./results"          # The folder where your extraction script saves the JSONs
MASTER_JSON_FILE = "master.json" # Your unified database
PROCESSED_DIR = "./results/archive" # Where to move files after they are added

def update_master_json():
    print("🚀 Starting JSON aggregation...")
    
    # 1. Ensure our directories exist
    os.makedirs(NEW_JSON_DIR, exist_ok=True)
    os.makedirs(PROCESSED_DIR, exist_ok=True)

    # 2. Load the existing master JSON (or create a new empty list)
    if os.path.exists(MASTER_JSON_FILE):
        try:
            with open(MASTER_JSON_FILE, 'r') as f:
                master_data = json.load(f)
        except json.JSONDecodeError:
            print(f"  [Warning] {MASTER_JSON_FILE} is empty or corrupted. Starting fresh.")
            master_data = []
    else:
        master_data = []

    # Ensure the master file is a list structure
    if not isinstance(master_data, list):
        master_data = [master_data]

    processed_count = 0

    # 3. Loop through any new JSONs waiting in the output folder
    for filename in os.listdir(NEW_JSON_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(NEW_JSON_DIR, filename)
            
            try:
                with open(filepath, 'r') as f:
                    new_program = json.load(f)
                
                # --- The Smart Update Logic ---
                # Check if this program already exists in the master list
                prog_name = new_program.get("program_name", "Unknown Program")
                
                # --- The NEW Smart Update Logic ---
                prog_name = new_program.get("program_name", "Unknown Program")
                acad_year = new_program.get("academic_year", "Unknown Year")
                
                # Now we check BOTH the name and the year!
                existing_index = next((i for i, item in enumerate(master_data) 
                                       if item.get("program_name") == prog_name 
                                       and item.get("academic_year") == acad_year), None)

                if existing_index is not None:
                    print(f"  🔄 Updating existing entry: {prog_name} ({acad_year})")
                    master_data[existing_index] = new_program # Overwrites if you fix a typo in the 2025 doc
                else:
                    print(f"  ➕ Adding new entry: {prog_name} ({acad_year})")
                    master_data.append(new_program) # Appends cleanly as a separate entry

                if existing_index is not None:
                    print(f"  🔄 Updating existing entry for: {prog_name}")
                    master_data[existing_index] = new_program # Overwrite the old one
                else:
                    print(f"  ➕ Adding new entry for: {prog_name}")
                    master_data.append(new_program) # Append the new one
                
                # 4. Move the file to the archive so we don't process it again tomorrow
                shutil.move(filepath, os.path.join(PROCESSED_DIR, filename))
                processed_count += 1

            except Exception as e:
                print(f"  ❌ Error processing {filename}: {e}")

    # 5. Save the unified data back to the master file
    if processed_count > 0:
        with open(MASTER_JSON_FILE, 'w') as f:
            json.dump(master_data, f, indent=4)
        print(f"✅ Successfully processed {processed_count} files into {MASTER_JSON_FILE}!")
    else:
        print("🤷 No new JSON files found to add. Master database is up to date.")

if __name__ == "__main__":
    update_master_json()