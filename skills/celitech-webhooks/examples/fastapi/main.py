# Generated with: celitech-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Mapping, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Celitech Webhook Handler")


def resolve_signature_headers(headers: Mapping[str, str]) -> Optional[dict]:
    """Celitech deliveries carry svix-* headers. Hookdeck also accepts the Standard
    Webhooks webhook-* names when svix-id is absent, so do the same. The three values
    are handed to the library under the svix-* names it expects."""
    prefix = "svix" if headers.get("svix-id") else "webhook"
    msg_id = headers.get(f"{prefix}-id")
    timestamp = headers.get(f"{prefix}-timestamp")
    signature = headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        return None
    return {"svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": signature}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/celitech")
async def celitech_webhook(request: Request):
    secret = os.environ.get("CELITECH_WEBHOOK_SECRET")
    if not secret:
        print("CELITECH_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = resolve_signature_headers(request.headers)
    if sig_headers is None:
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Celitech signed, whatever the content type
    raw_body = await request.body()
    try:
        # HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, entry.
        # The library also enforces a fixed 5-minute timestamp window; see
        # references/verification.md for a manual verifier without it.
        Webhook(secret).verify(raw_body, sig_headers)
    except WebhookVerificationError as err:
        print(f"Celitech webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body is flat: `type` plus the event's fields (no `data` wrapper).
    # svix-id is stable across retries: use it to deduplicate.
    event_type = event.get("type")
    print(f"Received Celitech webhook {sig_headers['svix-id']}: {event_type}")

    if event_type == "consumption.threshold.reached":
        print(
            f"Purchase {event.get('purchaseId')} at {event.get('actualPercentage')}% "
            f"(threshold {event.get('notificationPercentage')}%, "
            f"{event.get('dataUsageRemainingInGB')} of {event.get('dataLimitInGB')} GB left)"
        )
    elif event_type == "esim.downloaded":
        print(f"eSIM downloaded: {event.get('iccid')}")
    elif event_type == "esim.installed":
        print(f"eSIM installed: {event.get('iccid')}")
    elif event_type == "esim.enabled":
        print(f"eSIM enabled: {event.get('iccid')}")
    elif event_type == "esim.disabled":
        print(f"eSIM disabled: {event.get('iccid')}")
    elif event_type == "esim.deleted":
        print(f"eSIM deleted: {event.get('iccid')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
