# Generated with: sohar-health-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Sohar Health Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/sohar-health")
async def sohar_health_webhook(request: Request):
    secret = os.environ.get("SOHAR_HEALTH_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("SOHAR_HEALTH_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Sohar Health (Svix) signed
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
        print(f"Sohar Health webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Bodies are flat: `event` plus the resource id (verificationId | discoveryId | flowRunId).
    # `status` is the resource's state, not the event type. Sandbox events carry a `sandbox.` prefix.
    event_type = event.get("event")
    # No retry schedule or ordering is documented: deduplicate on svix-id (or resource id + status)
    print(f"Received Sohar Health webhook {event_type}")

    if event_type in ("verification.updated", "sandbox.verification.updated"):
        # A verification completed (e.g. status "complete.eligible")
        print(f"Verification updated: {event.get('verificationId')} {event.get('id')} {event.get('status')}")
    elif event_type in ("verification.pending", "sandbox.verification.pending"):
        # Not resolved immediately; a verification.updated follows when it completes
        print(f"Verification pending: {event.get('verificationId')} {event.get('id')} {event.get('status')}")
    elif event_type in ("discovery.updated", "sandbox.discovery.updated"):
        print(f"Discovery updated: {event.get('discoveryId')} {event.get('id')} {event.get('status')}")
    elif event_type in ("flow.updated", "sandbox.flow.updated"):
        print(
            f"Flow run updated: {event.get('flowRunId')} {event.get('flowId')} "
            f"{event.get('status')} {event.get('stateId')}"
        )
    elif event_type in ("flow.callback", "sandbox.flow.callback"):
        # The flow run is waiting for input; `input` is a JSON Schema describing it
        print(f"Flow run awaiting input: {event.get('flowRunId')} {json.dumps(event.get('input'))}")
    else:
        # Return 200 for events you don't handle (the documented list may not be exhaustive)
        print(f"Unhandled event: {event_type}")

    return {"success": True, "event": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
