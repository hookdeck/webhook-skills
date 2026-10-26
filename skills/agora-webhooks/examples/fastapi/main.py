# Generated with: agora-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX_SHA1 = re.compile(r"[0-9a-fA-F]{40}")


def verify_agora_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify an Agora webhook signature.

    Agora-Signature is the bare lowercase hex HMAC-SHA1 of the raw request body
    (key = the Signing Secret as UTF-8 bytes). Nothing else is signed.
    """
    if not signature or not secret:
        return False

    # Validate format before comparing (exact length and alphabet)
    if not HEX_SHA1.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)


@app.post("/webhooks/agora")
async def agora_webhook(request: Request):
    # Read the raw bytes before parsing - the signature covers exactly these bytes
    raw_body = await request.body()

    # Read the secret per request so it can be rotated without a restart
    if not verify_agora_webhook(
        raw_body, request.headers.get("agora-signature"), os.environ.get("AGORA_WEBHOOK_SECRET")
    ):
        print("Agora webhook signature verification failed")
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    # Parse the payload only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    # eventType is a JSON number; productId (1 = RTC) scopes the code space
    product_id = event.get("productId")
    event_type = event.get("eventType")
    payload = _as_dict(event.get("payload"))
    print(f"Received productId={product_id} eventType={event_type} noticeId={event.get('noticeId')}")

    if product_id == 1:
        match str(event_type):
            case "101":
                print(f"Channel created: {payload.get('channelName')}")
            case "102":
                print(f"Channel destroyed: {payload.get('channelName')}")
            case "103":
                print(f"Broadcaster joined {payload.get('channelName')}: uid {payload.get('uid')}")
            case "104":
                print(f"Broadcaster left {payload.get('channelName')}: uid {payload.get('uid')}")
            case _:
                print(f"Unhandled RTC event: {event_type}")
    else:
        print(f"Unhandled product {product_id} event: {event_type}")

    # Agora wants a 200 with a JSON body within 10 seconds; duplicates happen, so dedupe on noticeId
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
