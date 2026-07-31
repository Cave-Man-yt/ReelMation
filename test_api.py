import json
import os
import urllib.request

TOKEN_FILE_CLI = os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token")
with open(TOKEN_FILE_CLI) as f:
    token = json.load(f)["token"]["access_token"]

def api_call(payload):
    req = urllib.request.Request(
        "https://cloudcode-pa.googleapis.com/v1internal:generateChat",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))

print("Default:")
res1 = api_call({
    "userMessage": "Write a 500 word story.", 
    "project": "sustained-flare-xhpd3", 
    "tierId": "standard-tier",
    "history": [
        {"author": "USER", "content": "You are a viral scriptwriter."},
        {"author": "SYSTEM", "content": "Understood. I will follow these instructions precisely."}
    ]
})
print("Default length:", len(res1.get("markdown", "")))
print("Text:", res1.get("markdown", ""))

try:
    print("With modelConfig:")
    res2 = api_call({
        "userMessage": "Write a 500 word story.", 
        "project": "sustained-flare-xhpd3", 
        "tierId": "standard-tier",
        "modelConfig": {"maxOutputTokens": 8192}
    })
    print("modelConfig length:", len(res2.get("markdown", "")))
except urllib.error.HTTPError as e:
    print("modelConfig failed:", e, e.read().decode("utf-8", errors="replace"))

try:
    print("With generationConfig:")
    res3 = api_call({
        "userMessage": "Write a 500 word story.", 
        "project": "sustained-flare-xhpd3", 
        "tierId": "standard-tier",
        "generationConfig": {"maxOutputTokens": 8192}
    })
    print("generationConfig length:", len(res3.get("markdown", "")))
except urllib.error.HTTPError as e:
    print("generationConfig failed:", e, e.read().decode("utf-8", errors="replace"))
    res3 = api_call({
        "userMessage": "Write a 500 word story.", 
        "project": "sustained-flare-xhpd3", 
        "tierId": "standard-tier",
        "model": "gemini-1.5-pro"
    })
    print("Model length:", len(res3.get("markdown", "")))
except Exception as e:
    print("Model failed:", e)
