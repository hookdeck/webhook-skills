import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-f]{64}", re.IGNORECASE | re.ASCII)


def verify_hint_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    """Verify X-Hint-Signature: `sha256=` + hex(HMAC-SHA256(raw_body, webhooks signature key)).

    The bare digest (no prefix) is accepted too. Only the body is signed.
    """
    if not header or not secret:
        return False
    digest = header.removeprefix("sha256=")
    # Check the format before comparing: exactly 64 hex characters
    if not HEX_DIGEST.fullmatch(digest):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes, never str, so the comparison is constant time and cannot raise
    return hmac.compare_digest(digest.lower().encode("ascii"), expected.encode("ascii"))


@app.post("/webhooks/hint-health")
async def hint_health_webhook(request: Request):
    # Raw body is required: the signature covers the exact bytes Hint sent
    raw_body = await request.body()

    signature = request.headers.get("x-hint-signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing signature header")
    if not verify_hint_signature(raw_body, signature, os.environ.get("HINT_HEALTH_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification, and treat every field as untrusted
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # The event name is the top-level "type" field; "object" is the affected record
    event_type = event.get("type") if isinstance(event.get("type"), str) else None
    obj = event.get("object") if isinstance(event.get("object"), dict) else None
    event_id = event.get("id") if isinstance(event.get("id"), str) else None

    if event_type == "patient.created":
        print(f"Patient created: {event_id} {obj}")
    elif event_type == "patient.updated":
        print(f"Patient updated: {event_id} {obj}")
    elif event_type == "patient.destroyed":
        print(f"Patient destroyed: {event_id} {obj}")
    elif event_type == "patient.inactive":
        print(f"Patient inactive: {event_id} {obj}")
    elif event_type == "membership.created":
        print(f"Membership created: {event_id} {obj}")
    elif event_type == "membership.updated":
        print(f"Membership updated: {event_id} {obj}")
    elif event_type == "membership.destroyed":
        print(f"Membership destroyed: {event_id} {obj}")
    elif event_type == "practitioner.created":
        print(f"Practitioner created: {event_id} {obj}")
    elif event_type == "practitioner.updated":
        print(f"Practitioner updated: {event_id} {obj}")
    elif event_type == "practitioner.destroyed":
        print(f"Practitioner destroyed: {event_id} {obj}")
    else:
        print(f"Unhandled event type: {event_type}")

    # Delivery is at least once: dedupe on the envelope id, and reply 2xx within 20 seconds
    return {"received": True}
