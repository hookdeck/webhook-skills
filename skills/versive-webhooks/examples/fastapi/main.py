# Generated with: versive-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Versive Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/versive")
async def versive_webhook(request: Request):
    secret = os.environ.get("VERSIVE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("VERSIVE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Versive (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library accepts either header-name set, so hand it the resolved values under both.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:
        # A malformed signature entry raises a plain ValueError rather than WebhookVerificationError
        print(f"Versive webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `event_type`, beside the `interview` and `study` objects.
    # There is no event id in the body, and no header carries the type.
    event_type = event.get("event_type")
    interview = event.get("interview")
    study = event.get("study")
    if not isinstance(interview, dict):
        interview = {}
    if not isinstance(study, dict):
        study = {}
    # `svix-id` is stable across retries of the same message: use it to deduplicate
    print(f"Received Versive webhook {msg_id}: {event_type}")

    if event_type == "interview.completed":
        # Sent when a participant completes an interview (screened-out interviews are excluded).
        # The interview can carry transcripts and recordings: treat it as sensitive and log only what you need.
        fallback = " (fallback transcription)" if interview.get("used_fallback_transcription") else ""
        print(f"Interview completed: {interview.get('id')} study {study.get('id')} {study.get('title')}{fallback}")
    else:
        # Return 2xx for events you don't handle, or Versive keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
