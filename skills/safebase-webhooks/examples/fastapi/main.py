# Generated with: safebase-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="SafeBase Webhook Handler")

def get_event_name(body: Any) -> Optional[str]:
    """SafeBase doesn't document which body field carries the event name (the test
    event has none, real events do), so check the likely candidates."""
    if isinstance(body, dict):
        for key in ("eventType", "event_type", "type", "event"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value
    return None


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/safebase")
async def safebase_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
    webhook_id: Optional[str] = Header(None),
    webhook_timestamp: Optional[str] = Header(None),
    webhook_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("SAFEBASE_WEBHOOK_SECRET")
    if not secret:
        print("SAFEBASE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # SafeBase doesn't name the headers; svix-* is inferred, so fall back to the
    # webhook-* prefix (Svix's other prefix) when the svix-* headers are absent.
    svix_id = svix_id or webhook_id
    svix_timestamp = svix_timestamp or webhook_timestamp
    svix_signature = svix_signature or webhook_signature
    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes SafeBase signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature and enforces a fixed 5-minute timestamp window. That window
        # rejects late Hookdeck retries/replays: see references/verification.md.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:  # ValueError: e.g. non-ASCII header values
        print(f"SafeBase webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = get_event_name(body)
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received SafeBase webhook {svix_id}: {event_type or '(no event name)'}")

    if event_type == "accessRequest.requested":
        print(f"Access request received: {body}")
    elif event_type == "accessRequest.blocked":
        print(f"Access request blocked: {body}")
    elif event_type == "accessRequest.autoApprove.requireManual":
        print(f"Access request needs manual approval: {body}")
    elif event_type == "accounts.created":
        print(f"Account created: {body}")
    elif event_type == "accounts.nda.completed":
        print(f"NDA completed: {body}")
    elif event_type == "portal.viewed":
        print(f"Trust Center viewed: {body}")
    elif event_type == "portal.file.downloaded":
        print(f"File downloaded: {body}")
    elif event_type == "questionnaire.completed":
        print(f"Questionnaire completed: {body}")
    elif event_type == "knowledgebase.entry.created":
        print(f"Knowledge Base entry created: {body}")
    elif event_type is None:
        # The test event has no event name; log the body to see what arrived
        print(f"No event name in body: {body}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
