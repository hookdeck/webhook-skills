import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from whop_sdk.lib.verify_webhook import WebhookVerificationError, unwrap

load_dotenv()

app = FastAPI()


@app.post("/webhooks/whop")
async def whop_webhook(request: Request):
    secret = os.getenv("WHOP_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw body: Whop signs "{webhook-id}.{webhook-timestamp}.{raw body}".
    payload = await request.body()

    try:
        # Verifies the Standard Webhooks signature (HMAC-SHA256, v1,<base64>) and the
        # 5-minute timestamp window. The secret is passed exactly as Whop issued it
        # (ws_...); the SDK base64-encodes it so the library derives the literal key.
        event = unwrap(payload, headers=dict(request.headers), key=secret)
    except (WebhookVerificationError, ValueError) as err:
        print(f"Whop signature verification failed: {err}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event.get("type")
    data = event.get("data") or {}

    # Retries reuse the same webhook-id: store it and skip duplicates in production.
    if event_type == "payment.succeeded":
        print(f"Payment succeeded: {data.get('id')}")
    elif event_type == "payment.failed":
        print(f"Payment failed: {data.get('id')}")
    elif event_type == "membership.activated":
        print(f"Membership activated: {data.get('id')}")
    elif event_type == "membership.deactivated":
        print(f"Membership deactivated: {data.get('id')}")
    elif event_type == "refund.created":
        print(f"Refund created: {data.get('id')}")
    else:
        print(f"Unhandled event type: {event_type}")

    # Respond 2xx within 5 seconds or Whop retries.
    return {"received": True}
