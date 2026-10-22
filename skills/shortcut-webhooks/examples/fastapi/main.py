import os
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_shortcut_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Shortcut webhook signature.

    Payload-Signature is the hex HMAC-SHA256 of the raw request body (UTF-8),
    keyed with the secret string entered when the webhook was created.
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header.strip().lower().encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/shortcut")
async def shortcut_webhook(request: Request):
    # Raw bytes: the signature covers the exact body received
    raw_body = await request.body()
    signature = request.headers.get("payload-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing Payload-Signature header")

    if not verify_shortcut_webhook(raw_body, signature, os.environ.get("SHORTCUT_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    print(f"Received Shortcut event {payload.get('id')} (member: {payload.get('member_id')})")

    # One event can carry several actions; dispatch on entity_type + action
    for item in payload.get("actions", []):
        kind = f"{item.get('entity_type')} {item.get('action')}"

        if kind == "story create":
            print(f"Story created: {item.get('name')} ({item.get('id')})")
            # TODO: Post to Slack, create a branch, etc.
        elif kind == "story update":
            print(f"Story updated: {item.get('name')} ({item.get('id')})", list((item.get("changes") or {}).keys()))
            # TODO: React to workflow_state_id, owner_ids, estimate changes, etc.
        elif kind == "story delete":
            print(f"Story deleted: {item.get('id')}")
            # TODO: Remove the story from your own records
        elif kind == "epic update":
            print(f"Epic updated: {item.get('name')} ({item.get('id')})")
            # TODO: Sync epic status, notify stakeholders, etc.
        elif kind == "story-comment create":
            print(f"Comment created: {item.get('id')}")
            # TODO: Bot replies, command parsing, etc.
        else:
            print(f"Unhandled action: {kind}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
