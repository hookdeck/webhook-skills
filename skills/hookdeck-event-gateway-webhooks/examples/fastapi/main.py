import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

hookdeck_secret = os.environ.get("HOOKDECK_WEBHOOK_SECRET")


def verify_hookdeck_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify Hookdeck webhook signature."""
    if not signature or not secret:
        return False

    computed = base64.b64encode(
        hmac.new(
            secret.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).digest()
    ).decode('utf-8')

    return hmac.compare_digest(computed, signature)


@app.post("/webhooks")
async def webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature = request.headers.get("x-hookdeck-signature")
    event_id = request.headers.get("x-hookdeck-event-id")
    source_id = request.headers.get("x-hookdeck-source-id")
    attempt_number = request.headers.get("x-hookdeck-attempt-number")

    # Verify Hookdeck signature
    if not verify_hookdeck_signature(raw_body, signature, hookdeck_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)

    print(f"Received event {event_id} from source {source_id} (attempt {attempt_number})")

    # Handle based on the original event type
    event_type = payload.get("type") or payload.get("topic") or "unknown"
    print(f"Event type: {event_type}")

    # Example: Handle Stripe events
    if "type" in payload:
        if payload["type"] == "payment_intent.succeeded":
            data_object = payload.get("data", {}).get("object", {})
            print(f"Payment succeeded: {data_object.get('id')}")

        elif payload["type"] == "customer.subscription.created":
            data_object = payload.get("data", {}).get("object", {})
            print(f"Subscription created: {data_object.get('id')}")

        else:
            print(f"Received event: {payload['type']}")

    # Return 200 to acknowledge receipt
    return {"received": True, "eventId": event_id}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
