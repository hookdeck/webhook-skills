# Generated with: workable-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_signature(raw_body: bytes, signature_header: str | None, key: str | None) -> bool:
    """Workable signs the raw body with HMAC-SHA256 (hex) in X-Workable-Signature.

    The key is the API token that created the subscription (or the OAuth app secret).
    """
    if not signature_header or not key:
        return False
    expected = hmac.new(key.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.lower().encode(), expected.encode())


@app.post("/webhooks/workable")
async def workable_webhook(request: Request):
    # Raw bytes, whatever the Content-Type
    raw_body = await request.body()

    signature = request.headers.get("x-workable-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Workable-Signature header")
    if not verify_signature(raw_body, signature, os.getenv("WORKABLE_SIGNING_KEY")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("event_type") or payload.get("event")
    if event_type == "candidate_created":
        print("Candidate created:", payload.get("id"))
    elif event_type == "candidate_moved":
        print("Candidate moved:", payload.get("id"))
    elif event_type == "employee_created":
        print("Employee created:", payload.get("id"))
    elif event_type == "employee_updated":
        print("Employee updated:", payload.get("id"))
    elif event_type == "employee_published":
        print("Employee published:", payload.get("id"))
    else:
        print("Unhandled event:", event_type)

    # Workable replays the request unless the response is 200.
    return {"received": True}
