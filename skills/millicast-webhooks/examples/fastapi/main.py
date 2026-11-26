# Generated with: millicast-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Dolby OptiView Real-time (Millicast) webhook receiver for FastAPI.

Millicast (Dolby OptiView Real-time Streaming) signs each webhook with:
  x-millicast-signature: sha1=<hex HMAC-SHA1 of the raw body>
The body is JSON for most hooks and a JPEG for thumbnail hooks; both are
signed as raw bytes. The Webhook Secret is base64: decode it to get the key.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("millicast-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Dolby OptiView Real-time (Millicast) Webhook Handler")


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


def verify_millicast_webhook(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Check x-millicast-signature against the raw body (JSON or JPEG bytes)."""
    key = decode_base64_secret(secret)
    if key is None or not signature:
        return False
    match = re.fullmatch(r"sha1=((?:[0-9a-fA-F]{2})+)", signature.strip())
    if not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key, raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(payload: Any) -> Dict[str, Any]:
    """JSON hooks share one envelope: type ("feeds", "recordings", "media",
    "transcoder" or "viewerConnection"), event ("started", "ended", ...),
    timestamp (epoch ms) and data, which depends on the type."""
    body = payload if isinstance(payload, dict) else {}
    event_type, event, data = body.get("type"), body.get("event"), body.get("data")
    if event_type == "feeds":
        # data: feedId, accountId, name, streamId, active, and started or ended
        name = data.get("name") if isinstance(data, dict) else None
        logger.info("Millicast stream %s %s", name, event)
    elif event_type in ("recordings", "media"):
        logger.info("Millicast media %s", event)
    elif event_type == "transcoder":
        logger.info("Millicast transcoder %s", event)
    elif event_type == "viewerConnection":
        logger.info("Millicast viewer connection %s", event)
    else:
        logger.info("Millicast %s %s", event_type, event)
    # Events arrive asynchronously, so order isn't guaranteed.
    return {"received": True, "type": event_type, "event": event}


def handle_thumbnail(jpeg: bytes, stream_id: Optional[str]) -> Dict[str, Any]:
    """Thumbnail hooks: the body is the JPEG; stream details come in x-millicast-* headers."""
    logger.info("Millicast thumbnail for stream %s: %d bytes", stream_id, len(jpeg))
    return {"received": True, "type": "thumbnail", "bytes": len(jpeg)}


@app.post("/webhooks/millicast")
async def millicast_webhook(request: Request):
    secret = os.environ.get("MILLICAST_WEBHOOK_SECRET")
    if not secret:
        logger.error("MILLICAST_WEBHOOK_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_base64_secret(secret) is None:
        logger.error("MILLICAST_WEBHOOK_SECRET is not valid base64: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid base64"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_millicast_webhook(raw_body, request.headers.get("x-millicast-signature"), secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    # Thumbnail hooks send the captured JPEG (Content-Type image/jpeg), signed the same way.
    if request.headers.get("content-type", "").lower().startswith("image/"):
        return handle_thumbnail(raw_body, request.headers.get("x-millicast-stream-id"))

    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    return handle_event(payload)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
