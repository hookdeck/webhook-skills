from __future__ import annotations

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_HEADER = "x-trigger-signature-hmacsha256"


def verify_trigger_dev_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """The header is the bare hex HMAC-SHA256 of the raw body, keyed with the secret as UTF-8."""
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())


@app.post("/webhooks/trigger-dev")
async def trigger_dev_webhook(request: Request):
    # Use the raw bytes; re-serializing parsed JSON would change what was signed
    raw_body = await request.body()
    signature = request.headers.get(SIGNATURE_HEADER)

    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    if not verify_trigger_dev_webhook(raw_body, signature, os.getenv("TRIGGER_DEV_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event type is in the body (there is no event-type header)
    event_type = event.get("type")
    obj = event.get("object", {})

    if event_type == "alert.run.failed":
        print(f"Run {obj['run']['id']} of task {obj['task']['id']} failed")
        # TODO: Page on-call, open an incident, etc.
    elif event_type == "alert.deployment.success":
        print(f"Deployment {obj['deployment']['version']} succeeded")
        # TODO: Post to Slack, update a status page, etc.
    elif event_type == "alert.deployment.failed":
        print(f"Deployment {obj['deployment']['version']} failed: {obj['error']['message']}")
        # TODO: Notify the author, open a ticket, etc.
    elif event_type == "alert.error":
        print(f"Error group alert ({obj['classification']}): {obj['error']['message']}")
        # TODO: Create an issue for the new error group or regression
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
