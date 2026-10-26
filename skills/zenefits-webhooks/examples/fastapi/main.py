import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_zenefits_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify the `signature` header: hex(HMAC-SHA256(raw_body, webhook shared secret)).

    The secret is the app's webhook shared secret, not the OAuth client secret.
    """
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header fails verification instead of raising
    return hmac.compare_digest(signature_header.lower().encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/zenefits")
async def zenefits_webhook(request: Request):
    # Raw body is required: the signature covers the exact bytes Zenefits sent
    raw_body = await request.body()

    signature = request.headers.get("signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing signature header")
    if not verify_zenefits_signature(raw_body, signature, os.environ.get("ZENEFITS_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the "type" field; "data" matches the REST API for the object
    event_type = event.get("type")
    data = event.get("data")
    if event_type == "companies.did_change":
        print(f"Company changed: {data}")
    elif event_type == "people.did_create":
        print(f"Person created: {data}")
    elif event_type == "people.did_change":
        print(f"Person changed: {data}")
    elif event_type == "employments.did_start":
        print(f"Employment started: {data}")
    elif event_type == "employments.did_terminate":
        print(f"Employment terminated: {data}")
    elif event_type == "flow.did_complete.hiring":
        print(f"Hiring flow completed: {data}")
    else:
        print(f"Unhandled event type: {event_type}")

    # Any 2xx acknowledges receipt; Zenefits retries non-2xx for up to 1 hour
    return {"received": True}
