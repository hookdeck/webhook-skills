# Generated with: anarlog-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="


def verify_anarlog_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify an Anarlog webhook signature (x-anarlog-signature: sha256=<hex>).

    The HMAC key is the whole whsec_... secret as UTF-8 (this is NOT Standard Webhooks).
    """
    if not signature_header or not secret or not signature_header.startswith(SIGNATURE_PREFIX):
        return False

    received = signature_header[len(SIGNATURE_PREFIX):].lower()
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/anarlog")
async def anarlog_webhook(request: Request):
    # Raw bytes: the signature covers exactly what Anarlog sent
    raw_body = await request.body()
    signature_header = request.headers.get("x-anarlog-signature")

    # Read the secret per request so it can be configured after import
    if not verify_anarlog_webhook(raw_body, signature_header, os.environ.get("ANARLOG_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event") if isinstance(payload, dict) else None
    # Use payload["id"] (or the x-anarlog-delivery header) to dedupe retries
    data = (payload.get("data") if isinstance(payload, dict) else None) or {}
    meeting = data.get("meeting") or {}

    if event == "meeting.completed":
        print(f"Meeting completed: {meeting.get('title')} ({meeting.get('id')})")
        # TODO: Archive the transcript, create a CRM activity, notify a channel

    elif event == "note.enhanced":
        print(f"Summary generated for {meeting.get('title')}: {len(meeting.get('action_items') or [])} action items")
        # TODO: Post the summary, create tasks from action items

    elif event == "webhook.test":
        print("Received webhook.test from Anarlog")

    else:
        print(f"Unhandled event: {event}")

    # Return 200 quickly: deliveries time out after 10 seconds
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
