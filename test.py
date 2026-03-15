import urllib.request
import json
import ssl

# Fix for macOS SSL certificate issue
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

key = "AIzaSyAU1MG8Dt6j1mwfMsR63osbXcvUc73dsOY"  # Replace with your Gemini API key

url = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-2.5-flash:generateContent?key={key}"
)

body = json.dumps({
    "contents": [{"parts": [{"text": "Say hello in one sentence."}]}]
}).encode()

req = urllib.request.Request(
    url,
    data=body,
    headers={"Content-Type": "application/json"}
)

try:
    res = urllib.request.urlopen(req, context=ctx)
    data = json.loads(res.read())
    reply = data["candidates"][0]["content"]["parts"][0]["text"]
    print("✓ Key works! Gemini says:")
    print(reply)
except urllib.error.HTTPError as e:
    error = json.loads(e.read())
    print("✗ Error:", error.get("error", {}).get("message", "Unknown error"))
except Exception as e:
    print("✗ Unexpected error:", e)