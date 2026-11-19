# Generated with: paylocity-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Paylocity webhook receiver for FastAPI.

Paylocity signs each webhook with two headers:
  x-pcty-timestamp: <unix seconds>
  x-pcty-signature: keyId=<uuid>:signature=<hex>[,keyId=<uuid>:signature=<hex>]
Each signature is hex(HMAC-SHA256(base64Decode(secret), "<timestamp>.<raw body>")).
While a subscription has two active keys, every delivery carries one pair per
key, so a single stored secret matches one of them.
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
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("paylocity-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Paylocity Webhook Handler")


def decode_base64_secret(secret: Optional[str]) -> Optional[bytes]:
    """The secret is issued base64-encoded: the HMAC key is its decoded bytes.

    Python's default decoder drops characters it doesn't know, so insist on
    canonical base64 instead of keying with the wrong bytes. Surrounding
    whitespace (a pasted trailing newline) is trimmed.
    """
    value = (secret or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", value):
        return None
    try:
        key = base64.b64decode(value + "=" * (-len(value) % 4), validate=True)
    except (binascii.Error, ValueError):
        return None
    if not key or base64.b64encode(key).decode().rstrip("=") != value.rstrip("="):
        return None
    return key


def parse_paylocity_signatures(header: Optional[str]) -> List[Dict[str, str]]:
    """Split x-pcty-signature into its keyId/signature pairs."""
    pairs = []
    for part in (header or "").split(","):
        match = re.fullmatch(r"\s*keyId=([^:,\s]+):signature=((?:[0-9a-fA-F]{2})+)\s*", part)
        if match:
            pairs.append({"keyId": match.group(1), "signature": match.group(2)})
    return pairs


def verify_paylocity_webhook(
    raw_body: Union[bytes, str],
    signature_header: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
    tolerance_seconds: int = 0,
    now: Optional[float] = None,
) -> bool:
    """tolerance_seconds > 0 turns on Paylocity's recommended age check
    (300 seconds); it is off by default."""
    key = decode_base64_secret(secret)
    if key is None or not signature_header or not timestamp:
        return False
    if tolerance_seconds > 0:
        try:
            age = abs((time.time() if now is None else now) - float(timestamp))
        except ValueError:
            return False
        if age > tolerance_seconds:
            return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key, timestamp.encode("utf-8") + b"." + raw_body, hashlib.sha256).digest()
    # Accept the delivery if any pair matches: during rotation one is signed with each key.
    return any(
        hmac.compare_digest(bytes.fromhex(pair["signature"]), expected)
        for pair in parse_paylocity_signatures(signature_header)
    )


def handle_event(payload: Any, raw_body: bytes = b"") -> Dict[str, Any]:
    """Paylocity payloads are CloudEvents-style: id, type, time and data. The
    data fields depend on the event type (see Paylocity's Webhook Event Types page)."""
    data = payload if isinstance(payload, dict) else {}
    event_id = data.get("id")
    event_type = data.get("type")
    if event_type == "employee.assignment.v1":
        logger.info("Paylocity assignment change %s", event_id)
    elif event_type == "employee.assignment.status.v1":
        logger.info("Paylocity assignment status change %s", event_id)
    else:
        logger.info("Paylocity %s event %s", event_type, event_id)
    # Delivery is at least once: use id to skip duplicates.
    return {"received": True, "type": event_type}


def tolerance_seconds() -> int:
    """PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS, or 0 (no age check)."""
    try:
        return max(int(os.environ.get("PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS") or 0), 0)
    except ValueError:
        return 0


@app.post("/webhooks/paylocity")
async def paylocity_webhook(request: Request):
    secret = os.environ.get("PAYLOCITY_HMAC_SECRET")
    if not secret:
        logger.error("PAYLOCITY_HMAC_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_base64_secret(secret) is None:
        logger.error("PAYLOCITY_HMAC_SECRET is not valid base64: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid base64"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_paylocity_webhook(
        raw_body,
        request.headers.get("x-pcty-signature"),
        request.headers.get("x-pcty-timestamp"),
        secret,
        tolerance_seconds=tolerance_seconds(),
    ):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    return handle_event(payload, raw_body)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
