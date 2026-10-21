# Generated with: gopuff-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Gopuff Webhook Handler")


def classify(event) -> str:
    """Gopuff payloads carry no event-type field, so classify them by shape.

    order.status / order.status.v2 / order.delivered -> {"order": {...}}
    Delivery Status -> {"driver": {...}}; Delivery ETA -> {"expected_delivery_time": {...}}
    """
    if isinstance(event.get("order"), dict):
        return "order"
    if event.get("driver"):
        return "delivery_status"
    if event.get("expected_delivery_time"):
        return "delivery_eta"
    return "unknown"


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/gopuff")
async def gopuff_webhook(
    request: Request,
    # Svix sends svix-* headers; white-labeled accounts use webhook-*.
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None),
    webhook_id: str = Header(None),
    webhook_timestamp: str = Header(None),
    webhook_signature: str = Header(None),
):
    msg_id = svix_id or webhook_id
    timestamp = svix_timestamp or webhook_timestamp
    signature = svix_signature or webhook_signature
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    secret = os.environ.get("GOPUFF_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify against the RAW body, never a re-serialized payload.
    body = await request.body()
    try:
        # Signed content is f"{id}.{timestamp}.{body}"; the SDK checks every v1
        # signature in constant time and enforces a 5-minute timestamp tolerance.
        Webhook(secret).verify(
            body,
            {"svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": signature},
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

    # svix-id is stable across retries: use it as the idempotency key.
    kind = classify(event)
    if kind == "order":
        order = event["order"]
        status = order.get("status")
        print(f"Order status (order.status.v2): {order.get('partner_order_id')} -> {status}")
        if status == "Finished":
            print(f"Order delivered (order.delivered): {order.get('partner_order_id')}")
        elif status == "Cancelled":
            print(f"Order cancelled: {order.get('cancel_reason')}")
    elif kind == "delivery_status":
        print(f"Driver location: {event['driver'].get('location')}")
    elif kind == "delivery_eta":
        print(f"Delivery ETA: {event['expected_delivery_time']}")
    else:
        print("Unhandled Gopuff payload")

    return JSONResponse(content={"success": True, "kind": kind, "svixId": msg_id}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
