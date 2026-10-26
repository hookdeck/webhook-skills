# Generated with: purchasely-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

# Purchasely retries until it gets HTTP 200, so the same event can arrive more than once.
# event_id is stable across retries. Use a shared store (Redis, DB) in production.
processed: set[str] = set()


def compute_purchasely_signature(timestamp: str, raw_body: bytes, secret: str) -> str:
    """Purchasely signs the X-PURCHASELY-TIMESTAMP header value followed by the raw body
    (no separator) with HMAC-SHA256 and sends the lowercase hex digest, no prefix, in
    X-PURCHASELY-REQUEST-SIGNATURE. The message is built as bytes so the body is never
    decoded and re-encoded."""
    message = b"".join([timestamp.encode("latin-1"), raw_body])
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _default_tolerance() -> float:
    try:
        return float(os.environ.get("PURCHASELY_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        return 0


def verify_purchasely_request(headers, raw_body: bytes, secret=None, tolerance_seconds=None) -> bool:
    if secret is None:
        secret = os.environ.get("PURCHASELY_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept requests when unconfigured
    if tolerance_seconds is None:
        tolerance_seconds = _default_tolerance()

    signature = headers.get("x-purchasely-request-signature")
    timestamp = headers.get("x-purchasely-timestamp")
    if not signature or not timestamp:
        return False
    if not HEX_SHA256.fullmatch(signature):  # validate before decoding
        return False

    # Opt-in replay window. Off by default: Hookdeck retries and replays resend the
    # original timestamp, so a fixed window would reject legitimate deliveries.
    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False

    try:
        expected = bytes.fromhex(compute_purchasely_signature(timestamp, raw_body, secret))
    except UnicodeEncodeError:
        return False
    received = bytes.fromhex(signature.lower())  # 32 bytes, validated above
    return hmac.compare_digest(expected, received)


def handle_event(event: dict) -> None:
    name = event.get("event_name")
    sub_id = event.get("purchasely_subscription_id")

    if name == "SUBSCRIPTION_STARTED":
        print(f"Subscription started: {sub_id} ({event.get('plan')}, user {event.get('user_id')})")
        # TODO: grant access, start onboarding

    elif name == "SUBSCRIPTION_RENEWED":
        print(f"Subscription renewed: {sub_id}")
        # TODO: extend access to event["next_renewal_at"]

    elif name == "RENEWAL_DISABLED":
        print(f"Auto-renew turned off: {sub_id}")
        # TODO: start a win-back flow

    elif name in ("GRACE_PERIOD_STARTED", "ENTERED_BILLING_RETRY"):
        print(f"Billing issue ({name}): {sub_id}")
        # TODO: nudge the user to fix their payment method

    elif name == "SUBSCRIPTION_TERMINATED":
        print(f"Subscription terminated: {sub_id}")
        # TODO: revoke access

    elif name == "TRANSACTION_PROCESSED":
        print(f"Transaction processed: {event.get('amount_in_eur')} EUR ({event.get('store')})")
        # TODO: record revenue

    elif name == "ACTIVATE":
        print(f"Entitlement activated for user {event.get('user_id')}")
        # TODO: unlock the entitlement

    else:
        print(f"Unhandled event: {name}")


@app.post("/webhooks/purchasely")
async def purchasely_webhook(request: Request):
    # Verify the exact bytes received, whatever the content type.
    raw_body = await request.body()

    if not verify_purchasely_request(request.headers, raw_body):
        return JSONResponse({"error": "Invalid or missing Purchasely signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    if not isinstance(event, dict):
        return JSONResponse({"error": "Expected a JSON object"}, status_code=400)

    event_id = event.get("event_id")
    if event_id and event_id in processed:
        return JSONResponse({"received": True, "duplicate": True}, status_code=200)

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Purchasely event: {err}")
        # Any non-200 is retried, and later events for this user wait until it succeeds.
        return JSONResponse({"error": "Handler error"}, status_code=500)

    if event_id:
        processed.add(event_id)
    # Purchasely acknowledges only an exact HTTP 200 (other 2xx codes are retried).
    return JSONResponse({"received": True}, status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
