# Generated with: the-things-stack-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""The Things Stack webhook receiver for FastAPI.

The Things Stack doesn't sign webhooks. Checking "Request authentication" on
the webhook makes the Application Server send
    Authorization: Basic base64(<username>:<password>)
on every request (the docs call it "Authentication: Basic"; the Console code
sets Authorization). Requests are always POST, with a JSON body.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("the-things-stack-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="The Things Stack Webhook Handler")

# Each request carries exactly one of these top-level message objects.
MESSAGE_TYPES = (
    "uplink_message",
    "uplink_normalized",
    "join_accept",
    "downlink_ack",
    "downlink_nack",
    "downlink_sent",
    "downlink_failed",
    "downlink_queued",
    "downlink_queue_invalidated",
    "location_solved",
    "service_data",
)


def _safe_equal(given: str, expected: str) -> bool:
    """Constant-time string comparison that doesn't leak the length."""
    a = hashlib.sha256(given.encode("utf-8")).digest()
    b = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(a, b)


def verify_basic_auth(authorization: Optional[str], username: Optional[str], password: Optional[str]) -> bool:
    """Check an Authorization header against the configured credentials."""
    if not username or not password:
        return False
    match = re.fullmatch(r"Basic\s+([A-Za-z0-9+/]+={0,2})\s*", authorization or "", re.IGNORECASE)
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, ValueError):
        return False
    given_user, sep, given_pass = decoded.partition(":")  # the password may contain ':'
    if not sep:
        return False
    user_ok = _safe_equal(given_user, username)
    pass_ok = _safe_equal(given_pass, password)
    return user_ok and pass_ok


def handle_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """Every message has end_device_ids, correlation_ids and received_at, plus
    one message object named after its type. Empty fields are omitted."""
    msg_type = next((name for name in MESSAGE_TYPES if name in message), "unknown")
    device_id = (message.get("end_device_ids") or {}).get("device_id")
    if msg_type == "uplink_message":
        up = message["uplink_message"]
        # decoded_payload is present when a payload formatter is set; frm_payload is base64.
        logger.info("Uplink from %s on port %s: %s", device_id, up.get("f_port"), up.get("decoded_payload") or up.get("frm_payload"))
    elif msg_type == "join_accept":
        logger.info("Device %s joined", device_id)
    else:
        logger.info("%s message for %s", msg_type, device_id)
    return {"received": True, "type": msg_type, "device_id": device_id}


@app.post("/webhooks/the-things-stack")
async def the_things_stack_webhook(request: Request):
    username = os.environ.get("TTS_WEBHOOK_USERNAME")
    password = os.environ.get("TTS_WEBHOOK_PASSWORD")
    if not username or not password:
        logger.error("TTS_WEBHOOK_USERNAME and TTS_WEBHOOK_PASSWORD must both be set: rejecting request")
        return JSONResponse({"error": "Webhook credentials not configured"}, status_code=500)

    if not verify_basic_auth(request.headers.get("authorization"), username, password):
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)

    # X-Downlink-Apikey (when you set a Downlink API key) can schedule downlinks: don't log it.
    raw_body = await request.body()
    try:
        message = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # The Things Stack waits 5 seconds by default: answer quickly, process later.
    return handle_message(message)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
