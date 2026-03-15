"""
Debug script — tests AppleScript connection to Chrome step by step.
"""
import subprocess

def run_applescript(script):
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    print(f"  stdout: {repr(result.stdout.strip())}")
    print(f"  stderr: {repr(result.stderr.strip())}")
    return result.stdout.strip()

print("=== Test 1: Can we talk to Chrome at all? ===")
run_applescript('tell application "Google Chrome" to return name')

print("\n=== Test 2: Get the URL of the front tab ===")
run_applescript('tell application "Google Chrome" to return URL of active tab of front window')

print("\n=== Test 3: Get page title via JS ===")
run_applescript('tell application "Google Chrome" to execute javascript "document.title" in active tab of front window')

print("\n=== Test 4: Count links via JS ===")
run_applescript('tell application "Google Chrome" to execute javascript "document.querySelectorAll(\'a\').length.toString()" in active tab of front window')

print("\n=== Test 5: Check UI elements enabled ===")
run_applescript('tell application "System Events" to return UI elements enabled')