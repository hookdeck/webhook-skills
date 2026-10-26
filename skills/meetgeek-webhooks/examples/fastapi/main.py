# Generated with: meetgeek-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_meetgeek_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a MeetGeek webhook signature.

    MeetGeek sends ``X-MG-Signature: <hex>``: the lowercase hex HMAC-SHA256 of the exact raw
    request body, keyed with the UTF-8 bytes of the configured secret. Nothing else is signed.
    Both sides are compared as bytes.
    """
    if not signature_header or not HEX_64.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("utf-8")
    return hmac.compare_digest(signature_header.lower().encode("utf-8"), expected)


@app.post("/webhooks/meetgeek")
async def meetgeek_webhook(request: Request):
    secret = os.environ.get("MEETGEEK_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes BEFORE parsing: the signature covers the exact body
    raw_body = await request.body()
    signature = request.headers.get("x-mg-signature")

    if not verify_meetgeek_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # No event-name field: branch on meeting_id
    meeting_id = payload.get("meeting_id")
    if meeting_id:
        # successful-analysis: fetch the meeting via the MeetGeek Public API. Dedupe on meeting_id
        # (retries and team-shared meetings can deliver it more than once).
        print(f"MeetGeek analysis succeeded for meeting {meeting_id}")
    else:
        # failed-analysis
        print(f"MeetGeek analysis failed: {payload.get('message')}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
