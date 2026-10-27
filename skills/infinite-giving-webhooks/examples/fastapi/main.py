# Generated with: infinite-giving-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()

_HEX_DIGEST = re.compile(r"[0-9a-f]{64}")


def verify_infinite_giving_webhook(
    raw_body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
    secret: Optional[str],
    tolerance_seconds: int = 0,
) -> tuple[bool, Optional[str]]:
    """Verify an Infinite Giving webhook. Returns (valid, error).

    X-IG-Signature is `sha256=<hex>`: lowercase hex HMAC-SHA256, keyed with the
    partner signing secret (UTF-8), over `{X-IG-Timestamp}.{raw body}`. The signed
    message is built as bytes: the timestamp header exactly as received (latin-1),
    a literal ".", then the raw body bytes.
    """
    if not secret:
        return False, "Webhook secret not configured"
    if not timestamp:
        return False, "Missing X-IG-Timestamp header"
    if not signature:
        return False, "Missing X-IG-Signature header"

    # The `sha256=` prefix is optional. Hex is case-insensitive.
    digest = signature.removeprefix("sha256=").lower()

    # Validate the format before decoding.
    if not _HEX_DIGEST.fullmatch(digest):
        return False, "Malformed signature"

    signed_content = timestamp.encode("latin-1") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()

    if not hmac.compare_digest(expected, bytes.fromhex(digest)):
        return False, "Signature mismatch"

    # Opt-in replay window. Off by default: retries and replays resend the original timestamp.
    if tolerance_seconds > 0:
        if not re.fullmatch(r"\d+", timestamp) or abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    return True, None


def _tolerance_seconds() -> int:
    try:
        return int(os.getenv("INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        return 0


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/infinite-giving")
async def infinite_giving_webhook(request: Request):
    # Raw bytes: the signature covers the body exactly as received.
    raw_body = await request.body()

    valid, error = verify_infinite_giving_webhook(
        raw_body,
        request.headers.get("x-ig-timestamp"),
        request.headers.get("x-ig-signature"),
        os.getenv("INFINITE_GIVING_WEBHOOK_SECRET"),
        _tolerance_seconds(),
    )
    if not valid:
        print(f"Infinite Giving webhook verification failed: {error}")
        return PlainTextResponse(error, status_code=401)

    # Parse only after the signature check.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON", status_code=400)
    if not isinstance(payload, dict):
        return PlainTextResponse("Invalid payload", status_code=400)

    # Dispatch on the body's `event` field. X-IG-Webhook-Id (same as payload["id"])
    # is unique per delivery: use it to dedupe retries.
    delivery_id = request.headers.get("x-ig-webhook-id") or payload.get("id")
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "donation:created":
        org = (data.get("organization") or {}).get("name")
        print(
            f"New {data.get('type')} donation {data.get('id')} "
            f"({data.get('identifier')}, qty {data.get('quantity')}) for {org}: "
            f"status {data.get('status')} [{delivery_id}]"
        )
    elif event == "donation:updated":
        # There is no donation:completed event: completion is status "complete" here.
        status = data.get("status")
        if status == "complete":
            print(f"Donation {data.get('id')} complete, tax deductible: {data.get('tax_deductible_amount')} [{delivery_id}]")
        elif status in ("canceled", "failed"):
            print(f"Donation {data.get('id')} {status}: {data.get('cancelation_reason') or 'no reason given'} [{delivery_id}]")
        else:
            print(f"Donation {data.get('id')} updated, status {status} [{delivery_id}]")
    else:
        print(f"Unhandled Infinite Giving event: {event} [{delivery_id}]")

    return JSONResponse({"received": True})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
