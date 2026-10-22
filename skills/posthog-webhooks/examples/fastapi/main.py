import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI()


@app.post("/webhooks/posthog")
async def posthog_webhook(request: Request):
    secret = os.environ.get("POSTHOG_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="POSTHOG_WEBHOOK_SECRET is not set")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(
            status_code=400,
            detail="Missing webhook-id, webhook-timestamp or webhook-signature header",
        )

    # CRITICAL: verify against the raw body, not re-serialized JSON
    raw_body = await request.body()

    try:
        # HMAC-SHA256 over "{id}.{timestamp}.{body}" (Standard Webhooks).
        # The library enforces a fixed 5-minute timestamp window.
        payload = Webhook(secret).verify(raw_body, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Default body: {"event": {"event", "uuid", "distinct_id", "properties", ...}, "person": {...}}
    event = (payload or {}).get("event") or {}
    name = event.get("event")

    if name == "$pageview":
        print("Pageview:", event.get("distinct_id"), (event.get("properties") or {}).get("$current_url"))
    elif name == "$identify":
        print("Identify:", event.get("distinct_id"))
    elif name == "$autocapture":
        print("Autocapture:", event.get("distinct_id"))
    else:
        # Custom events arrive under their own names, e.g. "signed_up"
        print("Event:", name)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
