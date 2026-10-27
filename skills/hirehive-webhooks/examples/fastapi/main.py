# Generated with: hirehive-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="HireHive Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """HireHive sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/hirehive")
async def hirehive_webhook(request: Request):
    secret = os.environ.get("HIREHIVE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("HIREHIVE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes HireHive signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"HireHive webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body is { type, timestamp, data }: the event name is the top-level `type`, and `timestamp` is ISO 8601
    event_type = event.get("type")
    # webhook-id is stable across retries and the body has no event id: use it to deduplicate
    print(f"Received HireHive webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "job.created":
        print("Job created")
    elif event_type == "job.updated":
        print("Job updated")
    elif event_type == "job.status.updated":
        print("Job status updated")
    elif event_type == "job.deleted":
        print("Job deleted")
    elif event_type == "application.created":
        print("Application created")
    elif event_type == "application.stage.updated":
        print("Application stage updated")
    elif event_type == "application.deleted":
        print("Application deleted")
    elif event_type == "candidate.updated":
        print("Candidate updated")
    elif event_type == "candidate.note.created":
        print("Candidate note created")
    elif event_type == "candidate.note.updated":
        print("Candidate note updated")
    elif event_type == "candidate.note.deleted":
        print("Candidate note deleted")
    elif event_type == "candidate.tag.added":
        print("Candidate tag added")
    elif event_type == "candidate.tag.removed":
        print("Candidate tag removed")
    elif event_type == "feedback.requested":
        print("Feedback requested")
    elif event_type == "feedback.submitted":
        print("Feedback submitted")
    elif event_type == "feedback.updated":
        print("Feedback updated")
    elif event_type == "interview.created":
        print("Interview created")
    elif event_type == "interview.updated":
        print("Interview updated")
    elif event_type == "interview.cancelled":
        print("Interview cancelled")
    else:
        # The documented list may grow: acknowledge and ignore what you don't handle
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
