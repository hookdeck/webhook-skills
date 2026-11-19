# Generated with: payfit-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""PayFit webhook receiver for FastAPI.

PayFit delivers webhooks through Svix. Each request carries svix-id (dedupe
on it), svix-timestamp (seconds) and svix-signature (space-separated
"v1,<base64 HMAC-SHA256>" entries). Signed content is
f"{svix_id}.{svix_timestamp}.{raw_body}", and the key is the endpoint's signing
secret (whsec_...) with the prefix removed, base64-DECODED.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Any, Dict, Mapping, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("payfit-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="PayFit Webhook Handler")


def decode_signing_secret(secret: Optional[str]) -> Optional[bytes]:
    """The secret is "whsec_" + base64: the HMAC key is the decoded bytes.
    Insist on canonical base64 instead of keying with the wrong bytes."""
    value = (secret or "").strip()
    if value.startswith("whsec_"):
        value = value[len("whsec_"):]
    if not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", value):
        return None
    try:
        key = base64.b64decode(value + "=" * (-len(value) % 4), validate=True)
    except (binascii.Error, ValueError):
        return None
    if not key or base64.b64encode(key).decode().rstrip("=") != value.rstrip("="):
        return None
    return key


def verify_payfit_webhook(
    raw_body: Union[bytes, str],
    headers: Mapping[str, Optional[str]],
    secret: Optional[str],
    tolerance_seconds: Optional[int] = None,
    now: Optional[float] = None,
) -> bool:
    """Verify a PayFit (Svix) delivery. tolerance_seconds is optional (None =
    no window): a delivery replayed later keeps its original timestamp."""
    key = decode_signing_secret(secret)
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signatures = headers.get("svix-signature")
    if key is None or not msg_id or not timestamp or not signatures or not timestamp.isdigit():
        return False
    if tolerance_seconds is not None:
        current = time.time() if now is None else now
        if abs(current - int(timestamp)) > tolerance_seconds:
            return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    # During a secret rotation there is one entry per secret: any v1 match passes.
    for entry in signatures.split():
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature, validate=True)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return True
    return False


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Every body is {type, data}; data.companyId identifies the company."""
    event_type = event.get("type")
    data = event.get("data") or {}
    if event_type == "payroll.run":
        # payrollMonth is YYYYMM. Fetch the payroll data from the PayFit API.
        logger.info("Company %s ran payroll for %s", data.get("companyId"), data.get("payrollMonth"))
    elif event_type in ("integration.activated", "integration.deactivated"):
        logger.info("%s for company %s", event_type, data.get("companyId"))
    else:
        logger.info("Unhandled PayFit event: %s", event_type)
    return {"received": True, "type": event_type, "company_id": data.get("companyId")}


@app.post("/webhooks/payfit")
async def payfit_webhook(request: Request):
    secret = os.environ.get("PAYFIT_WEBHOOK_SECRET")
    if not secret:
        logger.error("PAYFIT_WEBHOOK_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_signing_secret(secret) is None:
        logger.error("PAYFIT_WEBHOOK_SECRET is not a valid whsec_ base64 secret: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid base64"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    tolerance = os.environ.get("PAYFIT_WEBHOOK_TOLERANCE_SECONDS")
    if not verify_payfit_webhook(raw_body, request.headers, secret, int(tolerance) if tolerance else None):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    return handle_event(event)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
