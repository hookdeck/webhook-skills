# Generated with: nitrosend-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Nitrosend Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Nitrosend sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/nitrosend")
async def nitrosend_webhook(request: Request):
    secret = os.environ.get("NITROSEND_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("NITROSEND_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Nitrosend signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Nitrosend webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Every body is { type, timestamp, data }: the event name is the dotted top-level `type`
    # (data.bounce.type is the bounce kind, not the event type)
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries: use it to deduplicate. Order events by event["timestamp"].
    print(f"Received Nitrosend webhook {sig_headers['webhook-id']}: {event_type}")
    if data.get("test") is True:
        print("(test event)")

    if event_type == "email.sent":
        print(f"Email sent: {data.get('message_id')} {data.get('to')}")
    elif event_type == "email.delivered":
        print(f"Email delivered: {data.get('message_id')} {data.get('to')}")
    elif event_type == "email.bounced":
        bounce = data.get("bounce") if isinstance(data.get("bounce"), dict) else {}
        print(f"Email bounced: {data.get('message_id')} {data.get('to')} {bounce.get('type')} {bounce.get('subtype')}")
    elif event_type == "email.complained":
        print(f"Email marked as spam: {data.get('message_id')} {data.get('to')}")
    elif event_type == "email.opened":
        print(f"Email opened: {data.get('message_id')} {data.get('to')}")
    elif event_type == "email.clicked":
        print(f"Email link clicked: {data.get('message_id')} {data.get('to')}")
    elif event_type == "email.failed":
        print(f"Email failed: {data.get('message_id')} {data.get('to')}")
    elif event_type == "email.received":
        # A reply or new mail to a brand inbox; text/html are capped at 64 KiB (see data.truncated)
        print(f"Email received: {data.get('from')} -> {data.get('to')} {data.get('subject')} (conversation {data.get('conversation_id')})")
    elif event_type == "campaign.completed":
        print("Campaign completed")
    elif event_type == "campaign.failed":
        print("Campaign failed")
    elif event_type == "campaign.stopped":
        print("Campaign stopped: bounce or complaint rate crossed the stop threshold")
    elif event_type == "flow.paused":
        print("Flow paused: bounce or complaint rate crossed the pause threshold")
    elif event_type == "sending.paused":
        print("Sending paused for the account")
    elif event_type == "sending.limit_approaching":
        print("Sending limit approaching")
    elif event_type == "sending.limit_reached":
        print("Sending limit reached: sends wait for capacity")
    elif event_type == "import.completed":
        print("Contact import completed")
    elif event_type == "import.failed":
        print("Contact import failed")
    elif event_type == "domain.verified":
        print("Sending domain verified")
    elif event_type == "domain.verification_lost":
        print("Sending domain lost verification")
    elif event_type == "domain.dns_degraded":
        print("Sending domain DNS degraded: Nitrosend is rechecking")
    elif event_type == "webhook.disabled":
        # Events that occurred while the endpoint was off are not re-sent: reconcile through the API
        print("Webhook disabled after 3 days of failed deliveries")
    else:
        # The documented list may grow: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
