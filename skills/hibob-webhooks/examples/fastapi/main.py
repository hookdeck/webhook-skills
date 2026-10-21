import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_bob_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify Bob-Signature: base64(HMAC-SHA512(raw_body, secret)).

    The secret is the raw string shown in the Bob webhook configuration.
    """
    if not signature_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).digest()
    ).decode("utf-8")
    return hmac.compare_digest(signature_header, expected)


def is_ping(raw_body: bytes) -> bool:
    """Bob sends "Ping test" (plain text) or {"text":"Ping test"} when a webhook is added."""
    text = raw_body.decode("utf-8", errors="replace").strip()
    if text == "Ping test":
        return True
    try:
        parsed = json.loads(text)
    except ValueError:
        return False
    return isinstance(parsed, dict) and parsed.get("text") == "Ping test"


@app.post("/webhooks/hibob")
async def hibob_webhook(request: Request):
    # Raw body is required: the signature covers the exact bytes Bob sent
    raw_body = await request.body()

    # Answer the connection test immediately with 200
    if is_ping(raw_body):
        return {"status": "ok"}

    signature = request.headers.get("bob-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Bob-Signature header")
    if not verify_bob_signature(raw_body, signature, os.environ.get("HIBOB_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the "type" field; payloads carry IDs, fetch details via Bob's API
    event_type = event.get("type")
    data = event.get("data")
    if event_type == "employee.created":
        print(f"Employee created: {data}")
    elif event_type == "employee.updated":
        print(f"Employee updated: {data}")
    elif event_type == "employee.joined":
        print(f"Employee joined: {data}")
    elif event_type == "employee.left":
        print(f"Employee left: {data}")
    elif event_type == "timeoff.request.requested":
        print(f"Time off requested: {data}")
    elif event_type == "timeoff.request.approved":
        print(f"Time off approved: {data}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}
