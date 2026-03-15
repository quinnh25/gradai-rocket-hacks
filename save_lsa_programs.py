"""
UMich LSA Majors & Minors — Save Requirements as PDFs
======================================================
Controls your real Chrome browser via AppleScript.
Navigates to the LSA majors/minors index, clicks each program link,
clicks Requirements, then saves as PDF.

HOW TO USE:
  1. Open Chrome — it can be on any page, the script will navigate it
  2. Make sure Chrome is accessible (System Settings → Privacy & Security → Accessibility → Terminal = ON)
  3. Run: python3 save_lsa_programs.py
  4. DON'T touch your mouse or keyboard while it runs

Requirements: no pip installs needed (uses built-in osascript/AppleScript)
"""

import subprocess
import time
import re
from pathlib import Path

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
OUTPUT_DIR    = Path(__file__).parent / "my_guides"
INDEX_URL     = "https://lsa.umich.edu/lsa/academics/majors-minors.html"
PAGE_LOAD_WAIT     = 5    # seconds to wait after navigating to a page
REQUIREMENTS_WAIT  = 2    # seconds to wait after clicking Requirements tab
PRINT_DIALOG_WAIT  = 3    # seconds to wait for print dialog
# ──────────────────────────────────────────────────────────────────────────────

# Full program list from the official LSA page
PROGRAMS = [
    "Actuarial Mathematics (Sub-Major)",
    "Afroamerican and African Studies (Major)",
    "Afroamerican and African Studies (Minor)",
    "American Culture (Major)",
    "American Culture (Minor)",
    "Anthropology (Major)",
    "Anthropology (Minor)",
    "Arab and Muslim American Studies (Minor)",
    "Arabic Studies (Minor)",
    "Archaeology (Sub-Major)",
    "Archaeology of the Ancient Mediterranean (Major)",
    "Archaeology of the Ancient Mediterranean (Minor)",
    "Architecture (Minor)",
    "Art & Design (Minor)",
    "Artificial Intelligence (Minor)",
    "Arts & Ideas in the Humanities (Major)",
    "Asian Languages and Cultures (Minor)",
    "Asian Studies (Major)",
    "Asian Studies (Minor)",
    "Asian/Pacific Islander American Studies (Minor)",
    "Astronomy and Astrophysics (Major)",
    "Astronomy and Astrophysics (Minor)",
    "Biochemistry (Minor)",
    "Biochemistry [B.S.] (Major)",
    "Biological Anthropology (Minor)",
    "Biological Physics Track (Sub-Major)",
    "Biology (Major)",
    "Biology (Minor)",
    "Biology, Health, and Society (Major)",
    "Biomolecular Science [A.B. or B.S.] (Major)",
    "Biophysics (Minor)",
    "Biophysics [B.S.] (Major)",
    "Biopsychology, Cognition, and Neuroscience (BCN) (Major)",
    "Bosnian/Croatian/Serbian, Literature and Culture (Minor)",
    "Business (Minor)",
    "Cellular and Molecular Biomedical Science (Major)",
    "Chemistry (Major)",
    "Chemistry (Minor)",
    "Civil Engineering (Minor)",
    "Classical Civilization (Major)",
    "Classical Civilization (Minor)",
    "Classical Languages (Minor)",
    "Classical Languages and Literatures (Major)",
    "Climate and Space Sciences and Engineering (Minor)",
    "Cognitive Science (Major)",
    "Communication and Media (Major)",
    "Community Action and Social Change (Minor)",
    "Comparative Culture & Identity (CCI) (Sub-Major)",
    "Comparative Literature, Arts, and Media (Major)",
    "Complex Systems (Minor)",
    "Computer Science (Major)",
    "Computer Science (Minor)",
    "Computing for Expression (Minor)",
    "Computing for Scientific Discovery (Minor)",
    "Creative Writing (Minor)",
    "Creative Writing and Literature (Major)",
    "Crime and Justice (Minor)",
    "Culture and Media (Sub-Major)",
    "Cultures and Literatures of Eastern Europe (Minor)",
    "Czech Language, Literature, and Culture (Minor)",
    "Dance (Minor)",
    "Data Science (Major)",
    "Data Science (Minor)",
    "Digital Studies (Minor)",
    "Disability Studies Minor (Minor)",
    "Drama (Major)",
    "Drama (Minor)",
    "Dutch Language and Culture (Minor)",
    "Earth and Environmental Sciences (Major)",
    "Earth Sciences (Minor)",
    "East European and Eurasian Studies (Minor)",
    "Ecology and Evolutionary Biology (EEB) (Minor)",
    "Ecology, Evolution, and Biodiversity (EEB) (Major)",
    "Economics (Major)",
    "Economics (Minor)",
    "Education for Empowerment (Minor)",
    "Electrical Engineering (Minor)",
    "Energy Science and Policy Minor (Minor)",
    "English (Major)",
    "English (Minor)",
    "Entrepreneurship (Minor)",
    "Environment (Major)",
    "Environment (Minor)",
    "Environment and Conservation (Sub-Major)",
    "Environmental Justice (Minor)",
    "Epistemology and Philosophy of Science (Minor)",
    "Ethnic Studies (Sub-Major)",
    "Film, Television, and Media (Major)",
    "Food and the Environment (Minor)",
    "French and Francophone Studies (Major)",
    "French and Francophone Studies (Minor)",
    "Gender and Health (Major)",
    "Gender and Health (Minor)",
    "Gender, Race, and Nation (Minor)",
    "General Studies (Major)",
    "Geology (Minor)",
    "Geospatial Science (Minor)",
    "German (Major)",
    "German Studies (Minor)",
    "Global Environment & Health (GEH) (Sub-Major)",
    "Global History (Minor)",
    "Global Media Studies (Minor)",
    "Global Theatre and Ethnic Studies (Minor)",
    "Greek (Ancient) Language and Literature (Major)",
    "Greek (Modern) Language and Culture (Major)",
    "Greek (Modern) Language and Culture (Minor)",
    "History (Major)",
    "History (Minor)",
    "History of Art (Major)",
    "History of Art (Minor)",
    "History of Law and Policy (Minor)",
    "History of Medicine and Health (Minor)",
    "History of Philosophy (Minor)",
    "Honors Mathematics (Sub-Major)",
    "Human Anatomy and Physiology (Minor)",
    "Human Origins, Biology, and Behavior (Major)",
    "Human-Centered Artificial Intelligence (Minor)",
    "Interdisciplinary Astronomy (Minor)",
    "Interdisciplinary Astronomy (B.A. or B.S.) (Major)",
    "Interdisciplinary Chemical Sciences (ICS) [A.B. or B.S.] (Major)",
    "Interdisciplinary Physics (A.B. or B.S.) (Major)",
    "Intergroup Relations Education (Minor)",
    "International Security, Norms & Cooperation (ISNC) (Sub-Major)",
    "International Studies (Major)",
    "International Studies (Minor)",
    "Islamic Studies (Minor)",
    "Italian (Major)",
    "Italian (Minor)",
    "Judaic Studies (Major)",
    "Judaic Studies (Minor)",
    "Latin American and Caribbean Studies (Major)",
    "Latin American and Caribbean Studies (Minor)",
    "Latin Language and Literature (Major)",
    "Latina/Latino Studies (Major)",
    "Latina/o Studies (Minor)",
    "Law, Justice, and Social Change (Minor)",
    "Law, Justice, and Social Change (Sub-Major)",
    "Lesbian Gay Bisexual Transgender Queer Sexuality Studies (Minor)",
    "Linguistics (Major)",
    "Linguistics (Minor)",
    "Mathematical Sciences (Sub-Major)",
    "Mathematics (Major)",
    "Mathematics (Minor)",
    "Mathematics of Finance and Risk Management (Sub-Major)",
    "Medical Anthropology (Minor)",
    "Medical Anthropology (Sub-Major)",
    "Medieval and Early Modern Studies (Minor)",
    "Microbiology (Major)",
    "Middle East Studies (Major)",
    "Middle East Studies (Minor)",
    "Middle Eastern and North African Studies (Major)",
    "Mind and Meaning (Minor)",
    "Modern Middle Eastern and North African Studies (Minor)",
    "Molecular, Cellular, and Developmental Biology (Major)",
    "Moral and Political Philosophy (Minor)",
    "Multidisciplinary Design (Minor)",
    "Museum Studies (Minor)",
    "Music (Minor)",
    "Native American Studies (Minor)",
    "Neuroscience (Major)",
    "Nuclear Engineering & Radiological Sciences (Minor)",
    "Oceanography (Minor)",
    "Organizational Studies (Major)",
    "Paleontology (Minor)",
    "Performing Arts Management and Entrepreneurship (Minor)",
    "Pharmacology (Minor)",
    "Philosophy (Major)",
    "Philosophy (Minor)",
    "Philosophy, Politics, and Economics (Major)",
    "Physics (Major)",
    "Physics (Minor)",
    "Playwriting (Minor)",
    "Polish (Major)",
    "Polish Language, Literature and Culture (Minor)",
    "Political Economy & Development (PED) (Sub-Major)",
    "Political Science (Major)",
    "Political Science (Minor)",
    "Politics, Law, and Economy (Sub-Major)",
    "Portuguese (Minor)",
    "Power, Identity, and Inequality (Sub-Major)",
    "Psychology (Major)",
    "Public Policy (Minor)",
    "Pure Mathematics (Sub-Major)",
    "Quantitative Methods in the Social Sciences (Minor)",
    "Real Estate (Minor)",
    "Religion (Minor)",
    "Romance Languages and Literatures (Major)",
    "Russian (Major)",
    "Russian Language, Literature, and Culture (Minor)",
    "Russian Studies (Minor)",
    "Russian, East European and Eurasian Studies (Major)",
    "Scandinavian Studies (Minor)",
    "Science, Technology, and Society (STS) (Minor)",
    "Screenwriting (Sub-Major)",
    "Secondary Mathematics Teaching Certificate (Sub-Major)",
    "Social Class and Inequality Studies (Minor)",
    "Social Media Analysis and Design (Minor)",
    "Social Theory and Practice (Major)",
    "Sociology (Major)",
    "Sociology and Social Work (Sub-Major)",
    "Sociology of Health & Medicine (Sub-Major)",
    "Sociology of Health and Medicine (Minor)",
    "Spanish (Major)",
    "Spanish Language, Literature, and Culture (Minor)",
    "Statistics (Major)",
    "Statistics (Minor)",
    "Structural Biology Track (Sub-Major)",
    "Sustainability (Minor)",
    "Theatre Design and Production (Minor)",
    "Translation (Major)",
    "Translation Studies (Minor)",
    "Ukrainian Language, Literature, and Culture (Minor)",
    "Urban Studies (Minor)",
    "User Experience Design (Minor)",
    "Water and the Environment (Minor)",
    "Women's and Gender Studies (Major)",
    "Writing (Minor)",
    "Yiddish Studies (Minor)",
]


def slugify(name: str) -> str:
    """Make a safe filename from a program name."""
    s = name.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s]+", "_", s.strip())
    return s[:80]


def run_applescript(script: str) -> str:
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return result.stdout.strip()


def js_in_chrome(js: str) -> str:
    """Run JavaScript in the active Chrome tab and return the result."""
    # Escape backslashes and double quotes for AppleScript string
    js_escaped = js.replace("\\", "\\\\").replace('"', '\\"')
    script = f'''
        tell application "Google Chrome"
            execute javascript "{js_escaped}" in active tab of front window
        end tell
    '''
    return run_applescript(script)


def navigate_to(url: str):
    run_applescript(f'''
        tell application "Google Chrome"
            activate
            set URL of active tab of front window to "{url}"
        end tell
    ''')
    time.sleep(PAGE_LOAD_WAIT)


def get_all_program_links() -> dict:
    """
    Scrape all program links from the index page.
    Returns dict of {program_name_lower: href}
    """
    print("  Scraping program links from index page...")
    result = js_in_chrome("""
        (function() {
            var links = document.querySelectorAll('a[href]');
            var results = [];
            for (var i = 0; i < links.length; i++) {
                var text = links[i].textContent.trim();
                var href = links[i].href;
                if (text.length > 2 && href.includes('lsa.umich.edu')) {
                    results.push(text + '|||' + href);
                }
            }
            return results.join('~~~');
        })()
    """)

    link_map = {}
    if result:
        for entry in result.split('~~~'):
            if '|||' in entry:
                text, href = entry.split('|||', 1)
                link_map[text.strip().lower()] = href.strip()

    print(f"  Found {len(link_map)} links on page.")
    return link_map


def find_best_link(program_name: str, link_map: dict) -> str | None:
    """
    Find the best matching URL for a program name.
    Strips the (Major)/(Minor)/(Sub-Major) suffix for matching.
    """
    # Strip type suffix like "(Major)", "(Minor)", "(Sub-Major)"
    clean = re.sub(r'\s*\((Major|Minor|Sub-Major)\)\s*$', '', program_name, flags=re.IGNORECASE).strip()

    candidates = [
        program_name.lower(),                    # exact match with suffix
        clean.lower(),                           # without suffix
        clean.lower() + " major",
        clean.lower() + " minor",
    ]

    for candidate in candidates:
        if candidate in link_map:
            return link_map[candidate]

    # Fuzzy: find any link whose text contains the clean name
    clean_lower = clean.lower()
    for text, href in link_map.items():
        if clean_lower in text or text in clean_lower:
            return href

    return None


def click_requirements(program_name: str) -> bool:
    """Click the Requirements tab/link on the current page."""
    result = js_in_chrome("""
        (function() {
            var els = document.querySelectorAll('a, button, [role=tab], li');
            for (var i = 0; i < els.length; i++) {
                if (els[i].textContent.trim().toLowerCase().includes('requirements')) {
                    els[i].click();
                    return 'clicked: ' + els[i].textContent.trim();
                }
            }
            return 'not found';
        })()
    """)
    time.sleep(REQUIREMENTS_WAIT)
    return result != 'not found'


def save_as_pdf(output_path: Path):
    """Open print dialog and save as PDF."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    filename = output_path.stem   # no .pdf extension — macOS adds it
    folder = str(output_path.parent)

    # Open print dialog
    run_applescript('''
        tell application "Google Chrome" to activate
        delay 0.5
        tell application "System Events"
            keystroke "p" using command down
        end tell
    ''')
    time.sleep(PRINT_DIALOG_WAIT)

    # Click PDF dropdown button
    run_applescript('''
        tell application "System Events"
            tell process "Google Chrome"
                try
                    click button "PDF" of window 1
                end try
            end tell
        end tell
    ''')
    time.sleep(1)

    # Click "Save as PDF..."
    run_applescript('''
        tell application "System Events"
            tell process "Google Chrome"
                try
                    click menu item "Save as PDF…" of menu 1 of button "PDF" of window 1
                end try
                try
                    click menu item "Save as PDF..." of menu 1 of button "PDF" of window 1
                end try
            end tell
        end tell
    ''')
    time.sleep(1.5)

    # Set filename
    run_applescript(f'''
        tell application "System Events"
            tell process "Google Chrome"
                keystroke "a" using command down
                keystroke "{filename}"
            end tell
        end tell
    ''')
    time.sleep(0.5)

    # Navigate to output folder using Cmd+Shift+G
    run_applescript(f'''
        tell application "System Events"
            tell process "Google Chrome"
                keystroke "g" using {{command down, shift down}}
            end tell
        end tell
    ''')
    time.sleep(0.8)

    run_applescript(f'''
        tell application "System Events"
            tell process "Google Chrome"
                keystroke "{folder}"
                key code 36
            end tell
        end tell
    ''')
    time.sleep(0.8)

    # Confirm folder selection
    run_applescript('''
        tell application "System Events"
            tell process "Google Chrome"
                key code 36
            end tell
        end tell
    ''')
    time.sleep(0.5)

    # Click Save
    run_applescript('''
        tell application "System Events"
            tell process "Google Chrome"
                keystroke return
            end tell
        end tell
    ''')
    time.sleep(1)


def check_permissions() -> bool:
    result = run_applescript('''
        tell application "System Events"
            return UI elements enabled
        end tell
    ''')
    if result.lower() != "true":
        print("\n⚠️  Accessibility permissions needed!")
        print("   System Settings → Privacy & Security → Accessibility → enable Terminal\n")
        return False
    return True


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")

    if not check_permissions():
        return

    # Step 1: load the index page and scrape all links
    print(f"\nLoading index page: {INDEX_URL}")
    navigate_to(INDEX_URL)
    time.sleep(2)  # extra wait for JS to render
    link_map = get_all_program_links()

    if not link_map:
        print("⚠️  No links found on index page. The page may not have loaded yet.")
        print("   Try increasing PAGE_LOAD_WAIT at the top of the script.")
        return

    # Step 2: process each program
    print(f"\nProcessing {len(PROGRAMS)} programs...\n")
    print("⚠️  DO NOT touch your mouse or keyboard!\n")
    time.sleep(3)

    skipped = []
    no_link = []

    for i, program in enumerate(PROGRAMS, 1):
        out_path = OUTPUT_DIR / (slugify(program) + ".pdf")

        if out_path.exists():
            print(f"[{i}/{len(PROGRAMS)}] [skip] {program}")
            skipped.append(program)
            continue

        # Find the URL for this program
        url = find_best_link(program, link_map)

        if not url:
            print(f"[{i}/{len(PROGRAMS)}] [no link] {program}")
            no_link.append(program)
            continue

        print(f"[{i}/{len(PROGRAMS)}] → {program}")

        # Navigate to program page
        navigate_to(url)

        # Click Requirements tab
        found = click_requirements(program)
        if found:
            print(f"       (clicked Requirements tab)")

        # Save as PDF
        save_as_pdf(out_path)
        print(f"    ✓ {out_path.name}")

        time.sleep(1)

    # Summary
    print(f"\n✅ Done! PDFs saved to: {OUTPUT_DIR}")
    if skipped:
        print(f"   Skipped (already existed): {len(skipped)}")
    if no_link:
        print(f"   No link found for {len(no_link)} programs:")
        for p in no_link:
            print(f"     - {p}")


if __name__ == "__main__":
    main()