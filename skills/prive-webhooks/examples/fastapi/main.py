# Generated with: prive-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import base64
import hashlib
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

# Every payload is {topic, idempotencyKey, data}, so the body names its topic.
# Each webhook also subscribes to one topic, so a path per topic works as a
# second check. Map path slug -> topic.
TOPICS = {
    "subscriptions-created": "subscriptions/created",
    "subscriptions-line-removed": "subscriptions/line_removed",
    "subscriptions-status-updated": "subscriptions/status/updated",
    "orders-created": "orders/created",
    "billing-attempts-created": "billingAttempts/created",
    "billing-attempts-success": "billingAttempts/success",
    "billing-attempts-failed": "billingAttempts/failed",
    "payment-method-updated": "paymentMethod/updated",
    "subscription-activities-created": "subscriptionActivities/created",
    "subscription-custom-attributes-updated": "subscription/customAttributes/updated",
}


def verify_prive_signature(raw_body: bytes, header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Prive webhook.

    `x-prive-hmac-sha256` is the bare base64 HMAC-SHA256 of the raw body, keyed
    with the secret token Prive provides to the merchant.
    """
    if not header or not secret:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("ascii")

    # Encode both sides: compare_digest raises TypeError on non-ASCII str,
    # which would turn a bad header into a 500 instead of a 401.
    return hmac.compare_digest(header.encode("utf-8"), expected.encode("utf-8"))


def handle_event(topic: Optional[str], payload) -> None:
    data = payload.get("data") if isinstance(payload, dict) else None
    ident = data.get("id") if isinstance(data, dict) else None

    if topic == "subscriptions/created":
        print(f"Subscription created: {ident}")
    elif topic == "subscriptions/line_removed":
        print(f"Subscription line removed: {ident}")
    elif topic == "subscriptions/status/updated":
        print(f"Subscription status updated: {ident}")
    elif topic == "orders/created":
        print(f"Order created: {ident}")
    elif topic == "billingAttempts/created":
        print(f"Billing attempt created: {ident}")
    elif topic == "billingAttempts/success":
        print(f"Billing attempt succeeded: {ident}")
    elif topic == "billingAttempts/failed":
        print(f"Billing attempt failed: {ident}")
    elif topic == "paymentMethod/updated":
        print(f"Payment method updated: {ident}")
    elif topic == "subscriptionActivities/created":
        print(f"Subscription activity created: {ident}")
    elif topic == "subscription/customAttributes/updated":
        print(f"Subscription custom attributes updated: {ident}")
    else:
        print(f"Unhandled topic: {topic}")


async def receive(request: Request, topic: Optional[str]) -> dict:
    # Read the raw body for signature verification - do NOT parse JSON first.
    raw_body = await request.body()

    # 1. Verify first. The secret is read per request so it can be rotated.
    if not verify_prive_signature(
        raw_body,
        request.headers.get("x-prive-hmac-sha256"),
        os.environ.get("PRIVE_WEBHOOK_SECRET"),
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # 2. Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # 3. Dispatch on the body's topic; a per-topic path must agree with it
    body_topic = payload.get("topic") if isinstance(payload, dict) else None
    if topic and body_topic and body_topic != topic:
        raise HTTPException(status_code=400, detail="Topic does not match path")
    handle_event(body_topic or topic, payload)

    return {"received": True}


# Generic endpoint (topic unknown) - used by the Hookdeck CLI default path
@app.post("/webhooks/prive")
async def prive_webhook(request: Request):
    return await receive(request, None)


# One endpoint per topic: /webhooks/prive/billing-attempts-failed, etc.
@app.post("/webhooks/prive/{topic_slug}")
async def prive_topic_webhook(topic_slug: str, request: Request):
    topic = TOPICS.get(topic_slug)
    if topic is None:
        raise HTTPException(status_code=404, detail="Unknown topic")
    return await receive(request, topic)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
