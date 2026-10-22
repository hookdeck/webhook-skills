# Generated with: sendcloud-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()


def verify_sendcloud_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Sendcloud signs the entire raw body: HMAC-SHA256, bare hex, Sendcloud-Signature header."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.encode())


@app.post("/webhooks/sendcloud")
async def sendcloud_webhook(request: Request):
    secret = os.getenv("SENDCLOUD_WEBHOOK_SECRET")
    if not secret:
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    signature = request.headers.get("sendcloud-signature")
    if not signature:
        return JSONResponse({"error": "Missing Sendcloud-Signature header"}, status_code=400)

    # Raw bytes, whatever the content type: never parse before verifying
    raw_body = await request.body()
    if not verify_sendcloud_signature(raw_body, signature, secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=400)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    action = event.get("action")
    if action == "parcel_status_changed":
        # Webhooks can arrive out of order: compare event["timestamp"] before overwriting state
        parcel = event.get("parcel") or {}
        print(f"Parcel {parcel.get('id')} -> {(parcel.get('status') or {}).get('message')}")
    elif action == "return_created":
        data = event.get("data") or {}
        print(f"Return {data.get('id')} created for order {data.get('order_number')}")
    elif action in ("integration_connected", "integration_updated", "integration_deleted"):
        print(f"{action}: integration {(event.get('integration') or {}).get('id')}")
    else:
        print(f"Unhandled action: {action}")

    return {"received": True}
