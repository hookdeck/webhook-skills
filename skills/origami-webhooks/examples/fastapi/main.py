# Generated with: origami-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Origami Webhook Handler")

JOB_EVENTS = {"job.succeeded", "job.failed", "job.cancelled", "job.needs_input"}


def as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/origami")
async def origami_webhook(request: Request):
    secret = os.environ.get("ORIGAMI_WEBHOOK_SECRET")
    if not secret:
        print("ORIGAMI_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the webhook-* headers; when webhook-id is absent, fall back to the svix-* headers
    prefix = "webhook" if request.headers.get("webhook-id") else "svix"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Origami signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library reads the webhook-* names, so hand it the resolved values under those names.
        Webhook(secret).verify(
            raw_body,
            {
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:
        # A malformed signature entry raises a plain ValueError rather than WebhookVerificationError
        print(f"Origami webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: {type, id, timestamp, data}. `id` equals the webhook-id header and is stable
    # across retries: use it to deduplicate. `timestamp` is the event time, not the dispatch time.
    event_type = event.get("type")
    data = as_dict(event.get("data"))
    print(f"Received Origami webhook {msg_id}: {event_type}")

    if event_type in JOB_EVENTS:
        # One shape for all four. Ignore an event whose `sequence` is not greater than the last one
        # you processed for this `job_id`. `metadata` echoes what you passed when admitting the Job.
        print(f"Job {event_type.split('.')[1]}: {data.get('job_id')} {data.get('operation')} "
              f"seq {data.get('sequence')} {data.get('metadata')}")
        error = as_dict(data.get("error"))
        if event_type == "job.failed":
            print(f"Job error: {error.get('code')} {error.get('message')}")
        if event_type == "job.needs_input":
            needs_input = as_dict(data.get("needs_input"))
            print(f"Needs input: {needs_input.get('questions') or needs_input.get('handoff')}")
    elif event_type == "table.run.completed":
        print(f"Table run completed: {data.get('run_id')} {data.get('table_id')} {data.get('status')} "
              f"{data.get('counts')} {data.get('failure_reason')}")
    elif event_type == "sequence.message.sent":
        # Branch on data.channel ("email" | "linkedin")
        print(f"Message sent: {data.get('channel')} {data.get('sequence_id')} {data.get('campaign_id')} "
              f"{as_dict(data.get('sender')).get('id')} {as_dict(data.get('message')).get('provider_id')}")
    elif event_type == "sequence.reply.received":
        print(f"Reply received: {data.get('channel')} {data.get('sequence_id')} {data.get('campaign_id')} "
              f"newly_stopped: {data.get('newly_stopped')}")
    elif event_type in ("sequence.connection.requested", "sequence.connection.accepted"):
        print(f"LinkedIn connection {event_type.split('.')[2]}: {data.get('sequence_id')} "
              f"{data.get('campaign_id')} {as_dict(data.get('outreach_target')).get('linkedin_slug')}")
    elif event_type == "sequence.comment.posted":
        print(f"LinkedIn comment posted: {data.get('sequence_id')} {data.get('campaign_id')} "
              f"{as_dict(data.get('comment')).get('post_url')}")
    elif event_type == "webhook.test":
        # Always delivered, regardless of subscription: a wire-connectivity check
        print(f"Test event: {data.get('triggered_by')} {data.get('message')}")
    else:
        # Return 200 for events you don't handle: other 4xx are dropped, 408/429/5xx are retried
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
