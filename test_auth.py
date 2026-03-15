import os
import base64
import requests
from dotenv import load_dotenv

# Load the keys
# load_dotenv()
# UM_CLIENT_ID = os.getenv("UM_CLIENT_ID")
# UM_CLIENT_SECRET = os.getenv("UM_CLIENT_SECRET")

UM_CLIENT_ID = "342VQ0O0UUAwg71GyfJSFsoODLG3aj5V3bCOH8gIJKJ8ulGV"
UM_CLIENT_SECRET = "ZbMkDyB3bPGPHUfcV9a8z9wD3LIcddv2qlNBSu7peIO6DsrL4sy1Dle7cEOGD6zc"

print("--- DIAGNOSTICS ---")
print(f"Client ID loaded: {str(UM_CLIENT_ID)[:5]}... (Length: {len(str(UM_CLIENT_ID)) if UM_CLIENT_ID else 0})")
print(f"Client Secret loaded: {str(UM_CLIENT_SECRET)[:5]}... (Length: {len(str(UM_CLIENT_SECRET)) if UM_CLIENT_SECRET else 0})")

if not UM_CLIENT_ID or not UM_CLIENT_SECRET:
    print("❌ ERROR: Your .env file is not being read correctly. The keys are missing.")
    exit()

# UMich Token URL
TOKEN_URL = "https://gw.api.it.umich.edu/um/oauth2/token"

# Manually encode exactly as the IBM Gateway requires
credentials = f"{UM_CLIENT_ID}:{UM_CLIENT_SECRET}"
encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')

headers = {
    "Authorization": f"Basic {encoded_credentials}",
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json"
}

payload = {
    "grant_type": "client_credentials",
    "scope": "umscheduleofclasses"
}

print("\n--- SENDING REQUEST ---")
response = requests.post(TOKEN_URL, data=payload, headers=headers)

print(f"Status Code: {response.status_code}")
print(f"Raw Server Response: {response.text}")