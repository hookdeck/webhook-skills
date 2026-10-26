# Generated with: lettermint-webhooks skill
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


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set LETTERMINT_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("LETTERMINT_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "LETTERMINT_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_lettermint_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a Lettermint webhook signature.

    Header: ``X-Lettermint-Signature: t=<unix seconds>,v1=<hex>``
    v1 = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the whole webhook secret
    (including ``whsec_``) as UTF-8 bytes. Not Standard Webhooks: nothing is stripped or decoded.
    """
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signatures = [v for k, v in pairs if k == "v1"]
    if not t:
        return False

    # Retries (and Hookdeck's replays) carry the original `t`, so the window is opt-in
    # (tolerance > 0).
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        current = time.time() if now is None else now
        if not (t.isascii() and t.isdigit()) or abs(current - int(t)) > tolerance:
            return False

    # Sign `t` exactly as sent (never parse and re-format it), then the raw body bytes.
    expected = hmac.new(
        secret.encode("utf-8"), t.encode("latin-1", "replace") + b"." + raw_body, hashlib.sha256
    ).digest()

    # Any v1 may match (several appear during key rotation). Validate length and alphabet first,
    # then compare the decoded bytes in constant time.
    return any(
        HEX64.fullmatch(sig) is not None and hmac.compare_digest(bytes.fromhex(sig), expected)
        for sig in signatures
    )


@app.post("/webhooks/lettermint")
async def lettermint_webhook(request: Request):
    # Read the raw bytes BEFORE parsing - the signature is over the exact body.
    raw_body = await request.body()
    header = request.headers.get("x-lettermint-signature")
    secret = os.environ.get("LETTERMINT_WEBHOOK_SECRET")

    if not secret:
        logging.getLogger(__name__).error("LETTERMINT_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not header:
        raise HTTPException(status_code=401, detail="Missing X-Lettermint-Signature header")
    if not verify_lettermint_webhook(raw_body, header, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event = payload.get("event")
    data = _as_dict(payload.get("data"))

    if event == "message.delivered":
        print(f"Message delivered to {data.get('recipient')}: {data.get('message_id')}")
    elif event == "message.hard_bounced":
        print(f"Hard bounce for {data.get('recipient')}: remove from lists")
    elif event == "message.soft_bounced":
        print(f"Soft bounce for {data.get('recipient')}: {data.get('message_id')}")
    elif event == "message.spam_complaint":
        print(f"Spam complaint from {data.get('recipient')}: stop mailing")
    elif event == "message.failed":
        print(f"Message failed ({data.get('reason_code')}): {data.get('message_id')}")
    elif event == "suppression.added":
        print(f"Suppression added: {data.get('value')} ({data.get('reason')})")
    elif event == "webhook.test":
        print("Received Lettermint test event")
    else:
        print(f"Unhandled event type: {event}")
    # TODO: persist / forward. `id` is unique per event: use it as the idempotency key.
    print(f"Processed {event} (id {payload.get('id')})")

    # Respond 2XX quickly; timeouts, 408, 429 and 5xx are retried (12 attempts over ~14 hours).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
