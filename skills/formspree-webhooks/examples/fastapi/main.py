# Generated with: formspree-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

_HEX_64 = re.compile(r"[0-9a-fA-F]{64}")
_DECIMAL = re.compile(r"[0-9]+")

# Retries resend identical bytes, so the body hash identifies a delivery.
# Use a shared store (Redis, a unique DB column) in production.
seen_deliveries: set[str] = set()


def parse_signature_header(header: str) -> tuple[str | None, int, list[str]]:
    """Parse Formspree-Signature: "t=<unix>,v1=<hex>".

    The header can carry more than one v1= entry (key rotation) and other keys
    such as v0, which are ignored.
    """
    timestamp = None
    timestamp_count = 0
    signatures: list[str] = []

    for field in header.split(","):
        key, separator, value = field.partition("=")
        if not separator:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            timestamp = value
            timestamp_count += 1
        elif key == "v1":
            signatures.append(value)

    return timestamp, timestamp_count, signatures


def tolerance_from_env() -> int:
    """Opt-in replay window in seconds. Unset, 0 or invalid = off (the default)."""
    try:
        seconds = int(os.environ.get("FORMSPREE_WEBHOOK_TOLERANCE_SECONDS", "0"))
    except ValueError:
        return 0
    return max(seconds, 0)


def verify_formspree_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance_seconds: int | None = None,
    now: int | None = None,
) -> tuple[bool, str | None]:
    """Verify a Formspree webhook signature.

    Signed content: b"<t>." + raw body bytes (t exactly as it appears in the header)
    Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes, hex digest
    """
    if not header:
        return False, "Missing Formspree-Signature header"

    timestamp, timestamp_count, signatures = parse_signature_header(header)
    if timestamp_count != 1 or not timestamp or not signatures:
        return False, "Malformed Formspree-Signature header"

    if tolerance_seconds is None:
        tolerance_seconds = tolerance_from_env()
    if tolerance_seconds > 0:
        current = int(time.time()) if now is None else now
        if not _DECIMAL.fullmatch(timestamp) or abs(current - int(timestamp)) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    # Check the format (exact length and alphabet) before comparing anything.
    candidates = [sig.lower().encode("ascii") for sig in signatures if _HEX_64.fullmatch(sig)]
    if not candidates:
        return False, "Malformed Formspree-Signature header"

    expected = hmac.new(
        secret.encode("utf-8"),
        timestamp.encode("utf-8") + b"." + raw_body,
        hashlib.sha256,
    ).hexdigest().encode("ascii")

    # Accept when ANY v1 entry matches; check them all so timing doesn't reveal which.
    matched = False
    for candidate in candidates:
        matched = hmac.compare_digest(expected, candidate) or matched

    return (True, None) if matched else (False, "Invalid signature")


def handle_submission(payload: dict[str, Any]) -> None:
    """Every delivery is a new form submission: there is no event name field or header.

    Treat every field as untrusted even after the signature check.
    """
    form = payload.get("form")
    form = form if isinstance(form, str) else None

    keys = payload.get("keys")
    keys = [k for k in keys if isinstance(k, str)] if isinstance(keys, list) else []

    submission = payload.get("submission")
    submission = submission if isinstance(submission, dict) else {}

    date = submission.get("_date")
    date = date if isinstance(date, str) else None
    print(f"Form submission on {form or 'unknown form'} at {date or 'unknown time'}")

    for key in keys:
        value = submission.get(key)
        if isinstance(value, (str, int, float, bool)):
            print(f"  {key}: {value}")


@app.post("/webhooks/formspree")
async def formspree_webhook(request: Request):
    secret = os.environ.get("FORMSPREE_WEBHOOK_SECRET")
    if not secret:
        print("FORMSPREE_WEBHOOK_SECRET is not set")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Raw bytes exactly as received, whatever the content type. Build Hooks send
    # an empty body.
    raw_body = await request.body()

    # 1. Verify first, on the raw bytes.
    valid, error = verify_formspree_signature(
        raw_body, request.headers.get("formspree-signature"), secret
    )
    if not valid:
        print(f"Formspree webhook verification failed: {error}")
        return JSONResponse({"error": error}, status_code=401)

    # 2. Build Hook: valid delivery, nothing to read.
    if not raw_body:
        return JSONResponse({"received": True})

    # 3. Parse only now.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON payload"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"error": "Expected a JSON object"}, status_code=400)

    # 4. Retries can duplicate a submission: skip ones already handled.
    key = hashlib.sha256(raw_body).hexdigest()
    if key in seen_deliveries:
        return JSONResponse({"received": True, "duplicate": True})
    seen_deliveries.add(key)

    # Answer within 3 seconds: in production, persist or queue here, then process async.
    handle_submission(payload)

    return JSONResponse({"received": True})


@app.get("/health")
async def health():
    return {"status": "ok"}
