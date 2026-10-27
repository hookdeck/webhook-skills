# Generated with: qonto-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()
logger = logging.getLogger("qonto")

HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")


def verify_qonto_signature(
    raw_body: bytes,
    header: Optional[str],
    secret: str,
    tolerance_seconds: int = 0,
) -> Tuple[bool, Optional[str]]:
    """Verify X-Qonto-Signature: `t=<unix seconds>,v1=<hex>`.

    MAC = HMAC-SHA256(key = secret as UTF-8 bytes, message = `<t>.<raw body bytes>`), lowercase hex.
    The secret may start with `whsec_` but is NOT a Standard Webhooks secret:
    the whole string is the key (nothing stripped, nothing base64-decoded).
    """
    if not header:
        return False, "Missing X-Qonto-Signature header"

    t: Optional[str] = None
    candidates = []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t" and t is None:
            t = value
        elif key == "v1":  # other keys (e.g. v0) are ignored
            candidates.append(value)
    if not t:
        return False, "Missing t= in signature header"
    if not candidates:
        return False, "Missing v1= in signature header"

    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", t) or abs(time.time() - int(t)) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    # Signed message is bytes: t exactly as it appears in the header, ".", raw body bytes.
    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest().encode("ascii")

    # Validate length and alphabet before comparing; hex is case-insensitive.
    well_formed = [c for c in candidates if HEX64.match(c)]
    if not well_formed:
        return False, "Malformed v1 signature"

    if any(hmac.compare_digest(c.lower().encode("ascii"), expected) for c in well_formed):
        return True, None
    return False, "Signature mismatch"


def handle_qonto_event(event: dict) -> None:
    """Dispatch on the top-level `type` (subscription type); `data.event` says what happened."""
    data = event.get("data") or {}
    what = data.get("event")
    event_type = event.get("type")
    if event_type == "v1/transactions":
        logger.info("Transaction %s: %s (%s %s, %s)", what, data.get("id"), data.get("amount"), data.get("currency"), data.get("status"))
    elif event_type == "v1/cards":
        logger.info("Card %s: %s (%s)", what, data.get("id"), data.get("status"))
    elif event_type == "v1/transfers":
        logger.info("Transfer %s: %s (%s %s, %s)", what, data.get("id"), data.get("amount_currency"), data.get("amount"), data.get("status"))
    else:
        logger.info("Unhandled Qonto event: %s %s", event_type, what or "")


def _process(event: dict) -> None:
    try:
        handle_qonto_event(event)
    except Exception:
        logger.exception("Error processing Qonto event")


@app.post("/webhooks/qonto")
async def qonto_webhook(request: Request, background_tasks: BackgroundTasks):
    secret = os.environ.get("QONTO_WEBHOOK_SECRET")
    if not secret:
        logger.error("QONTO_WEBHOOK_SECRET is not set; rejecting webhook")
        return PlainTextResponse("Webhook secret not configured", status_code=500)

    # Raw bytes for any content type; parse only after verifying.
    raw_body = await request.body()
    try:
        tolerance = int(os.environ.get("QONTO_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    ok, error = verify_qonto_signature(
        raw_body, request.headers.get("x-qonto-signature"), secret, tolerance
    )
    if not ok:
        logger.error("Qonto webhook verification failed: %s", error)
        return PlainTextResponse(f"Webhook Error: {error}", status_code=401)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON payload", status_code=400)
    if not isinstance(event, dict):
        return PlainTextResponse("Invalid JSON payload", status_code=400)

    # Qonto expects a 2xx within 1 second: acknowledge first, process after.
    background_tasks.add_task(_process, event)
    return JSONResponse({"received": True})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
