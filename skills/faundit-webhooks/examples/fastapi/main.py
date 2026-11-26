# Generated with: faundit-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

faundit_secret = os.environ.get("FAUNDIT_WEBHOOK_SECRET", "")


def verify_faundit_webhook(
    raw_body: bytes,
    timestamp: str | None,
    signature_next: str | None,
    secret: str,
) -> bool:
    """Verify a Faundit webhook signature (current v1 scheme).

    Faundit signs "v1:<timestamp>:<body>" with HMAC-SHA256 (hex) and sends the
    result in the X-Faundit-Signature-Next header. timestamp is the value of the
    X-Faundit-Timestamp header; body is the raw, unparsed request body.
    """
    if not signature_next or not timestamp:
        return False

    signed_content = b"v1:" + timestamp.encode("utf-8") + b":" + raw_body
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_content,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_next, expected)


@app.post("/webhooks/faundit")
async def faundit_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first)
    raw_body = await request.body()
    timestamp = request.headers.get("x-faundit-timestamp")
    # Prefer the current v1 header. The deprecated v0 header (X-Faundit-Signature)
    # signs only the timestamp and is not used here.
    signature_next = request.headers.get("x-faundit-signature-next")

    # Verify webhook signature over the raw body
    if not verify_faundit_webhook(raw_body, timestamp, signature_next, faundit_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    payload = json.loads(raw_body)
    event_type = payload.get("event-type")
    data = payload.get("data", {})

    print(
        f"Received {event_type} event "
        f"(id: {data.get('id')}, location: {data.get('locationID')})"
    )

    # Handle the event based on its type. The granular status is data["status"].
    if event_type == "item-status":
        handle_item_status(data)
    elif event_type == "request-status":
        handle_request_status(data)
    else:
        print(f"Unhandled event-type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


def handle_item_status(data: dict):
    """Handle an item-status event. data["status"] is one of:
    contact-missing, waiting-response, wrong-owner, pickup-by-guest, left-behind,
    finished, shipment-paid, pickup-scheduled, in-route, delivered, deleted,
    expired, anonymized
    """
    status = data.get("status")
    item_id = data.get("id")

    if status == "pickup-scheduled":
        print(f"Item {item_id} pickup scheduled")
        # Your code: notify the owner, prepare fulfillment
    elif status == "in-route":
        print(f"Item {item_id} is in route")
        # Your code: update tracking
    elif status == "delivered":
        print(f"Item {item_id} delivered")
        # Your code: close the case with the owner
    elif status == "finished":
        print(f"Item {item_id} finished")
    elif status == "expired":
        print(f"Item {item_id} expired")
    else:
        print(f"Item {item_id} status: {status}")


def handle_request_status(data: dict):
    """Handle a request-status event. data["status"] is one of:
    registered, awaiting-guest-response, not-found, resolved, deleted,
    expired, anonymized
    """
    status = data.get("status")
    request_id = data.get("id")

    if status == "registered":
        print(f"Request {request_id} registered")
        # Your code: acknowledge the lost-item claim
    elif status == "resolved":
        print(f"Request {request_id} resolved")
        # Your code: notify the customer their item was matched
    elif status == "not-found":
        print(f"Request {request_id} not found")
    elif status == "expired":
        print(f"Request {request_id} expired")
    else:
        print(f"Request {request_id} status: {status}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
