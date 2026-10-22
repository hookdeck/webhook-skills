# Generated with: vgs-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("vgs-webhooks")
app = FastAPI()

# VGS signs every notification with the vgs-signature header:
#   vgs-signature: t=<unix seconds>,v0=<hex>
# v0 is HMAC-SHA256 of "<t>.<raw body>" keyed with the integration secret (UTF-8).
# https://docs.verygoodsecurity.com/enterprise-platform/developer-resources/webhook-notifications

# Optional freshness window in seconds. Off by default (0): VGS retries and Hookdeck
# retries/replays carry the original timestamp, so a window would reject late redeliveries.
# Set VGS_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("VGS_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "VGS_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str) -> dict:
    parts = {}
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        if sep and key.strip():
            parts[key.strip()] = value.strip()
    return parts


def verify_vgs(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    parts = parse_signature_header(signature_header)
    t, v0 = parts.get("t"), parts.get("v0")
    if not t or not v0:
        return False
    try:
        ts = int(t)
    except ValueError:
        return False
    # VGS's own example uses 60s. It's opt-in here: off unless VGS_TIMESTAMP_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - ts) > tolerance:
        return False

    expected = hmac.new(secret.encode("utf-8"), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(v0.encode(), expected.encode())


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("VGS_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("VGS_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_vgs(raw_body, request.headers.get("vgs-signature"), secret):
        logger.error("VGS webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/vgs")
async def vgs_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # The event type is the top-level "event" field (there is no event header)
    event = payload.get("event")
    details = payload.get("details") or {}

    if event in ("route.created", "route.updated", "route.delete"):
        logger.info("Route %s (%s): %s", details.get("route_name"), details.get("route_id"), event)
    elif event == "vault.created":
        logger.info("Vault created: %s (%s)", details.get("vault_name"), details.get("vault_id"))
    elif event in ("user.permissions_updated", "user.permissions_deleted"):
        logger.info("Permissions changed for %s: %s", details.get("user_email"), event)
    elif event in ("user.logged_in", "user.password_updated", "user.mfa_created", "user.mfa_deleted"):
        logger.info("User %s from %s: %s", details.get("user_email"), details.get("user_ip"), event)
    elif event == "proxy.upstream_error":
        logger.info("Upstream error from %s (occurrence %s)", details.get("upstream_host"), payload.get("occurrence"))
    elif event == "alias.reveal_failed":
        logger.info("Alias reveal failed (occurrence %s)", payload.get("occurrence"))
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
