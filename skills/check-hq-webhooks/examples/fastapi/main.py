import os
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_check_webhook(raw_body: bytes, signature_header: Optional[str], key: Optional[str]) -> bool:
    """Verify the Check-Signature header.

    Check sends the lowercase hex HMAC-SHA256 of the raw request body, keyed with
    the Webhook Config's `key` used as UTF-8 text (not hex-decoded).
    """
    if not signature_header or not key:
        return False

    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.strip().lower())


@app.post("/webhooks/check-hq")
async def check_webhook(request: Request):
    # Raw bytes: the signature is computed over exactly what Check sent
    raw_body = await request.body()
    signature = request.headers.get("check-signature")
    topic = request.headers.get("check-topic")
    event_id = request.headers.get("check-webhookevent-id")

    key = os.environ.get("CHECK_WEBHOOK_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="Webhook key not configured")

    if not verify_check_webhook(raw_body, signature, key):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The ping test webhook is a flat {"message": "Test webhook"} body
    if topic == "ping" or ("event" not in payload and payload.get("message")):
        print(f"Ping received: {payload.get('message')}")
        return {"received": True}

    event = payload.get("event")
    data = payload.get("data") or {}
    print(f"Received {topic} {event} (id: {event_id})")

    # Topic is in the Check-Topic header; event is in the body
    key_name = f"{topic} {event}"
    if key_name in ("payroll created", "payroll updated"):
        print(f"Payroll {data.get('id')} {event}: status {data.get('status')}")
        # TODO: Fetch the latest payroll from the Check API and sync your records

    elif key_name == "payroll status_change":  # deprecated in API version 2025-01-01
        print(f"Payroll {data.get('id')} status changed to {data.get('status')}")

    elif key_name == "payment status_change":
        print(f"Payment {data.get('id')} is now {data.get('status')}")
        # TODO: Handle processing, paid, failed or refunded

    elif key_name in ("employee created", "employee updated"):
        print(f"Employee {data.get('id')} {event}")
        # TODO: Sync the employee into your database

    else:
        print(f"Unhandled event: {topic} {event}")

    # Return 2XX within 5 seconds, even for events you ignore
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
