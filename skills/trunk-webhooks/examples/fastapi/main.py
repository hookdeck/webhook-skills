# Generated with: trunk-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Trunk Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/trunk")
async def trunk_webhook(request: Request):
    secret = os.environ.get("TRUNK_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("TRUNK_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Trunk (Svix) signed
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
        print(f"Trunk webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Flat body: the event name is the top-level `type`, next to the resource fields
    # (`test_case`, `repository`, `monitor`, `pr_number`, ...). `timestamp` is an ISO 8601 time: order by
    # it, not by receive time. There is no event id in the body, and no header carries the type.
    event_type = event.get("type")
    # `svix-id` is stable across retries of the same message: use it to deduplicate
    print(f"Received Trunk webhook {msg_id}: {event_type}")

    test_case = event.get("test_case") if isinstance(event.get("test_case"), dict) else {}
    monitor = event.get("monitor") if isinstance(event.get("monitor"), dict) else {}

    if isinstance(event_type, str) and event_type.startswith("pull_request."):
        # Merge Queue: one event per PR moving through the queue
        print(f"Merge Queue PR {event.get('pr_number')} {event_type.split('.')[1]}: {event.get('status')}")
    elif isinstance(event_type, str) and event_type.startswith("pull_request_batch."):
        # Merge Queue: a batch of PRs tested together (subscribe to this family separately)
        print(f"Merge Queue batch {event_type.split('.')[1]}: {event.get('status')}")
    elif event_type in ("test_case.status_changed", "v2.test_case.status_changed"):
        # The v1 event is being phased out in favor of v2.test_case.status_changed
        print(f"Test {test_case.get('name')}: {event.get('previous_status')} -> {event.get('new_status')}")
    elif event_type == "test_case.monitor_status_changed":
        print(f"Monitor {monitor.get('type')} {monitor.get('status')}: {test_case.get('name')}")
    elif event_type in ("test_case.quarantining_setting_changed", "v2.test_case.quarantining_setting_changed"):
        # Fires only when a setting is manually overridden to ALWAYS_QUARANTINE or NEVER_QUARANTINE
        print(f"Quarantine setting changed: {test_case.get('name')} {test_case.get('quarantined')}")
    elif event_type == "test_case.investigation_completed":
        print(f"AI investigation completed: {test_case.get('name')} {event.get('trigger')} {event.get('confidence')}")
    else:
        # Return 2xx for events you don't handle, or Trunk keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
