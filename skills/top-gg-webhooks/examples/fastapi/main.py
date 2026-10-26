# Generated with: top-gg-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set TOP_GG_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("TOP_GG_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "TOP_GG_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_top_gg_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a Top.gg v1 webhook signature.

    Header: ``x-topgg-signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]``. Other keys (e.g. v0)
    are ignored.
    v1 = hex HMAC-SHA256 over ``<t>.<raw body bytes>``, keyed with the ``whs_`` secret used
    WHOLE as UTF-8 bytes (not hex- or base64-decoded). ``t`` is used exactly as it appears.
    """
    if not header or not secret:
        return False
    pairs = [p.strip().partition("=")[::2] for p in header.split(",")]
    t = next((v for k, v in pairs if k == "t"), None)
    if not t:
        return False
    # Validate the format (exactly 64 hex chars) before comparing; hex is case-insensitive.
    signatures = [v.lower().encode() for k, v in pairs if k == "v1" and HEX_SHA256.fullmatch(v)]
    if not signatures:
        return False

    # Hookdeck retries and replays keep the original `t`, so the window is opt-in (tolerance > 0).
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (t.isascii() and t.isdigit()):
            return False
        if abs((time.time() if now is None else now) - int(t)) > tolerance:
            return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest().encode()
    return any(hmac.compare_digest(sig, expected) for sig in signatures)


def _dict(value) -> dict:
    """Wrong-typed fields in the (verified but still untrusted) body are treated as absent."""
    return value if isinstance(value, dict) else {}


def _str(value) -> str | None:
    return value if isinstance(value, str) else None


@app.post("/webhooks/top-gg")
async def top_gg_webhook(request: Request):
    # Read the raw bytes BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("x-topgg-signature")
    secret = os.environ.get("TOP_GG_WEBHOOK_SECRET")

    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not verify_top_gg_webhook(raw_body, header, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification, and treat every field as untrusted.
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    data = _dict(event.get("data"))
    user = _dict(data.get("user"))
    project = _dict(data.get("project"))
    event_type = event.get("type")

    if event_type == "vote.create":
        # data.id is the vote ID: deduplicate on it. data.weight is 2 during weekend multipliers.
        weight = data.get("weight")
        weight = weight if isinstance(weight, (int, float)) and not isinstance(weight, bool) else 1
        print(
            f"Vote {_str(data.get('id'))} on {_str(project.get('type'))} "
            f"{_str(project.get('platform_id'))} by {_str(user.get('name'))} (weight {weight})"
        )
    elif event_type == "webhook.test":
        print(f"Test webhook from {_str(user.get('name'))} for project {_str(project.get('id'))}")
    else:
        print(f"Unhandled event type: {_str(event_type)}")

    # Any 2xx within 5 seconds acknowledges; timeouts and 5xx are retried (v1: up to 3 times).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
