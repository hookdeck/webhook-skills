# Generated with: tensorlake-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Tensorlake Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/tensorlake")
async def tensorlake_webhook(request: Request):
    secret = os.environ.get("TENSORLAKE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("TENSORLAKE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Tensorlake (Svix) signed
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
        print(f"Tensorlake webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `event_type`; the payload is under `data`.
    # The envelope also has event_id (evt_..., stable across retries: deduplicate on it), event_version,
    # occurred_at, project_id, source_id, source_revision and source_ordinal.
    event_type = event.get("event_type")
    data = event.get("data")
    if not isinstance(data, dict):
        data = {}
    print(f"Received Tensorlake webhook {event.get('event_id') or msg_id}: {event_type}")
    # Delivery is at-least-once and unordered: dedupe on event_id, and order related events from the same
    # source_id by int(source_revision) then source_ordinal.
    sandbox = data.get("sandbox") or {}
    application = data.get("application") or {}
    request_info = data.get("request") or {}

    if event_type in (
        "tensorlake.sandbox.created",
        "tensorlake.sandbox.running",
        "tensorlake.sandbox.suspended",
        "tensorlake.sandbox.resumed",
        "tensorlake.sandbox.terminated",
    ):
        print(f"Sandbox {event_type.split('.')[2]}: {sandbox.get('id')} {data.get('previous_status')} -> {sandbox.get('status')}")
    elif event_type == "tensorlake.sandbox.failed":
        print(f"Sandbox failed: {sandbox.get('id')} {sandbox.get('outcome_reason')}")
    elif event_type in ("tensorlake.application.created", "tensorlake.application.updated", "tensorlake.application.deleted"):
        print(f"Application {event_type.split('.')[2]}: {application.get('name')} {application.get('version')}")
    elif event_type in ("tensorlake.application.request.created", "tensorlake.application.request.completed"):
        print(f"Application request {event_type.split('.')[3]}: {application.get('name')} {request_info.get('id')}")
    elif event_type == "tensorlake.application.request.failed":
        print(f"Application request failed: {application.get('name')} {request_info.get('id')} {request_info.get('failure_reason')}")
    else:
        # Return 2xx for events you don't handle, or Tensorlake keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
