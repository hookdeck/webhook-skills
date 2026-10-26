# Generated with: glean-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Glean Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def bearer_ok(request: Request) -> bool:
    """Optional extra check: Authorization: Bearer <secret> when the trigger was
    created with delivery.auth type BEARER. It never replaces the signature."""
    expected = os.environ.get("GLEAN_DELIVERY_BEARER")
    if not expected:
        return True
    actual = request.headers.get("authorization", "")
    return hmac.compare_digest(actual.encode(), f"Bearer {expected}".encode())


@app.post("/webhooks/glean")
async def glean_webhook(request: Request):
    secret = os.environ.get("GLEAN_SIGNING_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id = request.headers.get("webhook-id")
    timestamp = request.headers.get("webhook-timestamp")
    signature = request.headers.get("webhook-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    if not bearer_ok(request):
        raise HTTPException(status_code=401, detail="Invalid delivery credential")

    # Verify against the RAW body (any content type) — never re-serialized JSON.
    body = await request.body()
    try:
        # The library enforces a fixed 5-minute timestamp window. Retries/replays
        # keep the original timestamp, so late ones are rejected here. See
        # references/verification.md for a manual verifier with a configurable window.
        Webhook(secret).verify(
            body,
            {
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Presets are per deployment: dispatch on the payload's event_type.
    event_type = event.get("event_type")
    print(f"Received Glean trigger {event.get('trigger_id')} ({event_type}) webhook-id={msg_id}")

    if event_type == "CONTENT_SCHEDULE":
        print(f"Scheduled event: {event.get('title')} at {event.get('event_time')} {event.get('view_url')}")
        # TODO: kick off meeting prep
    else:
        print(f"Unhandled event type: {event_type} {event.get('reason')}")

    return JSONResponse(content={"success": True, "event_type": event_type}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
