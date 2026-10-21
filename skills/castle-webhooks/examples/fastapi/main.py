import base64
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_castle_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Verify X-Castle-Signature: base64 HMAC-SHA256 of the raw body, keyed with the API secret."""
    if not signature or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/castle")
async def castle_webhook(request: Request):
    # Raw body is required for signature verification
    raw_body = await request.body()
    signature = request.headers.get("x-castle-signature")

    if not verify_castle_signature(raw_body, signature, os.environ.get("CASTLE_API_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is in the body's `type` field
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "$policy.matched":
        policy = data.get("policy") or {}
        print(f"Policy matched: {policy.get('name')} (action: {policy.get('action')})")
        # TODO: suspend account, queue for review, etc.
    elif event_type == "$list_item.created":
        print(f"List item created: {data.get('primary_value')}")
        # TODO: sync to your blocklist/allowlist
    elif event_type == "$list_item.archived":
        print(f"List item archived: {data.get('primary_value')}")
        # TODO: remove from your blocklist/allowlist
    elif event_type == "$list_item.unarchived":
        print(f"List item unarchived: {data.get('primary_value')}")
        # TODO: re-add to your blocklist/allowlist
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
