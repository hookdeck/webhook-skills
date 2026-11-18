# Generated with: marqeta-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Marqeta webhook receiver for FastAPI.

Marqeta authenticates every webhook with HTTP Basic auth, using the
basic_auth_username and basic_auth_password set on the webhook (both required).
If the webhook also has a secret and signature_algorithm, X-Marqeta-Signature
carries the lowercase hex HMAC-SHA256 (or legacy HMAC-SHA1) of the raw body.
Set MARQETA_WEBHOOK_SECRET to check it too.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("marqeta-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Marqeta Webhook Handler")

HEX_LENGTH = {"sha256": 64, "sha1": 40}


def _safe_equal(given: str, expected: str) -> bool:
    """Constant-time string comparison that doesn't leak the length."""
    a = hashlib.sha256(given.encode("utf-8")).digest()
    b = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(a, b)


def verify_basic_auth(authorization: Optional[str], username: Optional[str], password: Optional[str]) -> bool:
    """Check the Authorization header against the webhook's Basic auth credentials."""
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


def parse_algorithms(value: Optional[str]) -> List[str]:
    """Accept "sha256" (default), "sha1", or "sha256,sha1" while you switch algorithms."""
    names = [a.strip() for a in (value or "sha256").lower().split(",")]
    return [a for a in names if a in HEX_LENGTH]


def verify_marqeta_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: str,
    algorithms: Optional[List[str]] = None,
) -> bool:
    """Verify X-Marqeta-Signature: hex HMAC of the exact raw body."""
    value = (signature or "").strip()
    if not secret or not re.fullmatch(r"[0-9a-fA-F]+", value):
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    given = bytes.fromhex(value) if len(value) % 2 == 0 else b""
    results = []
    for algorithm in algorithms or ["sha256"]:
        if len(value) != HEX_LENGTH[algorithm]:
            continue
        expected = hmac.new(secret.encode("utf-8"), raw_body, getattr(hashlib, algorithm)).digest()
        results.append(hmac.compare_digest(given, expected))
    return any(results)


def handle_notifications(message: Dict[str, Any]) -> Dict[str, Any]:
    """The body is keyed by notification type ("transactions", "cards",
    "usertransitions", ...), each with up to 10 notifications. Dedupe on each
    notification's token; use created_time for ordering."""
    counts: Dict[str, int] = {}
    for kind, notifications in message.items():
        if not isinstance(notifications, list):
            continue
        counts[kind] = len(notifications)
        for notification in notifications:
            if isinstance(notification, dict):
                logger.info("%s %s: %s %s", kind, notification.get("token"), notification.get("type"),
                            notification.get("state"))
    return {"received": True, "counts": counts}


@app.post("/webhooks/marqeta")
async def marqeta_webhook(request: Request):
    username = os.environ.get("MARQETA_WEBHOOK_USERNAME")
    password = os.environ.get("MARQETA_WEBHOOK_PASSWORD")
    if not username or not password:
        logger.error("MARQETA_WEBHOOK_USERNAME and MARQETA_WEBHOOK_PASSWORD must both be set: rejecting request")
        return JSONResponse({"error": "Webhook credentials not configured"}, status_code=500)

    if not verify_basic_auth(request.headers.get("authorization"), username, password):
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)

    raw_body = await request.body()

    secret = (os.environ.get("MARQETA_WEBHOOK_SECRET") or "").strip()
    if secret:
        algorithms = parse_algorithms(os.environ.get("MARQETA_SIGNATURE_ALGORITHM"))
        if not verify_marqeta_signature(raw_body, request.headers.get("x-marqeta-signature"), secret, algorithms):
            return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        message = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(message, dict):
        message = {}

    # Anything but 200 is a failure that Marqeta retries (except pings).
    if isinstance(message.get("pings"), list):
        return {"received": True, "ping": True}
    return handle_notifications(message)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
