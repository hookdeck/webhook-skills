# Generated with: pipecat-cloud-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Pipecat Cloud Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/pipecat-cloud")
async def pipecat_cloud_webhook(request: Request):
    secret = os.environ.get("PIPECAT_CLOUD_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("PIPECAT_CLOUD_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Pipecat Cloud (Svix) signed
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
        print(f"Pipecat Cloud webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `event_type`; the payload is under `data`.
    # `org` is the organization name and `created_at` an ISO 8601 UTC time. There is no event id
    # in the body, and no header carries the type.
    event_type = event.get("event_type")
    data = event.get("data")
    if not isinstance(data, dict):
        data = {}
    # `svix-id` is stable across retries of the same message: use it to deduplicate
    # (`webhook-test: true` marks "send test event" deliveries)
    print(f"Received Pipecat Cloud webhook {msg_id}: {event_type}")

    if event_type in ("build.started", "build.succeeded", "build.failed", "build.timeout"):
        # build.started is best-effort: a fast build may emit only a terminal event
        print(f"Build {event_type.split('.')[1]}: {data.get('build_id')} {data.get('image_uri') or data.get('error_message')}")
    elif event_type in ("deployment.created", "deployment.updated"):
        print(f"Deployment {event_type.split('.')[1]}: {data.get('service_name')} {data.get('region')}")
    elif event_type == "service.suspended":
        print(f"Service suspended: {data.get('service_name')} {data.get('reason')}")
    elif event_type == "service.resumed":
        print(f"Service resumed: {data.get('service_name')}")
    elif event_type == "spend.threshold_reached":
        print(f"Spend at {data.get('percent')}%: {data.get('current_spend_cents')} of {data.get('limit_cents')} cents")
    elif event_type == "spend.limit_reached":
        print(f"Spend limit reached: {data.get('current_spend_cents')} of {data.get('limit_cents')} cents")
    elif event_type == "spend.limit_cleared":
        print(f"Spend limit cleared, was {data.get('previous_limit_cents')} cents")
    elif event_type == "session.started":
        # This event spells the service name `service`, not `service_name`
        print(f"Session started: {data.get('session_id')} {data.get('service')} {data.get('transport')}")
    elif event_type == "org.trial_started":
        print(f"Trial started: {data.get('org_name')} {data.get('trial_credits_cents')}")
    elif event_type == "org.trial_ended":
        print(f"Trial credits exhausted: {data.get('org_name')} {data.get('amount_due_cents')}")
    elif event_type in ("api_key.created", "api_key.rotated", "api_key.deleted"):
        # The key value is never included
        print(f"API key {event_type.split('.')[1]}: {data.get('key_id')} {data.get('type')}")
    elif event_type in ("secret.created", "secret.updated", "secret.deleted"):
        # Secret values are never included
        print(f"Secret {event_type.split('.')[1]}: {data.get('set_name')} {data.get('scope')} {data.get('field_names')}")
    else:
        # Return 2xx for events you don't handle, or Pipecat Cloud keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
