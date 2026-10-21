# Generated with: revenuecat-webhooks skill
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

# RevenueCat re-signs every delivery attempt (including retries), so t is
# always recent. 300 seconds only has to cover clock skew and request latency.
TOLERANCE_SECONDS = 300
_DECIMAL = re.compile(r"[0-9]+")


def parse_signature_header(header: str) -> tuple[str | None, int, list[str]]:
    """Parse X-RevenueCat-Webhook-Signature: "t=<unix seconds>,v1=<hex>".

    Returns (timestamp, timestamp_count, signatures). Each field is split on
    its first "=" only.
    """
    timestamp = None
    timestamp_count = 0
    signatures: list[str] = []

    for field in header.split(","):
        key, sep, value = field.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            timestamp = value
            timestamp_count += 1
        elif key == "v1" and value:
            signatures.append(value.lower())

    return timestamp, timestamp_count, signatures


def verify_revenuecat_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance_seconds: int = TOLERANCE_SECONDS,
    now: int | None = None,
) -> tuple[bool, str | None]:
    """Verify a RevenueCat HMAC webhook signature.

    Signed content: f"{t}.{raw_body}" (raw bytes, not re-serialised JSON)
    Algorithm:      HMAC-SHA256 keyed with the signing secret (UTF-8), hex digest
    """
    if not header:
        return False, "Missing X-RevenueCat-Webhook-Signature header"

    timestamp, timestamp_count, signatures = parse_signature_header(header)
    if timestamp_count != 1 or not timestamp or not _DECIMAL.fullmatch(timestamp) or not signatures:
        return False, "Malformed X-RevenueCat-Webhook-Signature header"

    expected = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not any(hmac.compare_digest(expected, sig) for sig in signatures):
        return False, "Invalid signature"

    # t is inside the signed content, so it can't be refreshed on a replay.
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > tolerance_seconds:
        return False, "Timestamp outside tolerance"

    return True, None


def verify_authorization_header(received: str | None, expected: str) -> tuple[bool, str | None]:
    """Compare the Authorization header with the value configured on the integration.

    RevenueCat sends that value verbatim on every request. hmac.compare_digest
    is constant time for equal-length inputs and safe for unequal ones.
    """
    if not received:
        return False, "Missing Authorization header"
    if hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8")):
        return True, None
    return False, "Invalid Authorization header"


def handle_event(event: dict[str, Any]) -> None:
    event_type = event["type"]
    user = event.get("app_user_id")

    if event_type == "TEST":
        # Sent from the dashboard's "Send test event" button.
        print(f"Test event received: {event.get('id')}")
    elif event_type == "INITIAL_PURCHASE":
        print(f"Initial purchase of {event.get('product_id')} by {user}")
    elif event_type == "RENEWAL":
        print(f"Renewal of {event.get('product_id')} by {user}")
    elif event_type == "CANCELLATION":
        # Auto-renew turned off or refunded. Access continues until EXPIRATION.
        print(f"Cancellation for {user} (reason: {event.get('cancel_reason')})")
    elif event_type == "UNCANCELLATION":
        print(f"Uncancellation for {user}")
    elif event_type == "NON_RENEWING_PURCHASE":
        print(f"Non-renewing purchase of {event.get('product_id')} by {user}")
    elif event_type == "SUBSCRIPTION_PAUSED":
        # Don't revoke access here; wait for EXPIRATION with reason SUBSCRIPTION_PAUSED.
        print(f"Subscription pause scheduled for {user}")
    elif event_type == "EXPIRATION":
        # Revoke access.
        print(f"Expiration for {user} (reason: {event.get('expiration_reason')})")
    elif event_type == "BILLING_ISSUE":
        # A charge failed; the subscription has not expired yet.
        print(f"Billing issue for {user}")
    elif event_type == "PRODUCT_CHANGE":
        # The new product may not be in effect yet.
        print(f"Product change for {user}: {event.get('product_id')} -> {event.get('new_product_id')}")
    elif event_type in (
        "SUBSCRIPTION_EXTENDED",
        "REFUND_REVERSED",
        "INVOICE_ISSUANCE",
        "TRANSFER",
        "TEMPORARY_ENTITLEMENT_GRANT",
        "VIRTUAL_CURRENCY_TRANSACTION",
        "EXPERIMENT_ENROLLMENT",
        "PURCHASE_REDEEMED",
        "PRICE_INCREASE_CONSENT_REQUIRED",
        "PRICE_INCREASE_CONSENT_APPROVED",
    ):
        print(f"{event_type}: {event.get('id')}")
    else:
        # RevenueCat may add event types without an API version bump. Answer 200
        # so they aren't retried.
        print(f"Unhandled RevenueCat event type: {event_type}")


@app.post("/webhooks/revenuecat")
async def revenuecat_webhook(request: Request):
    secret = os.environ.get("REVENUECAT_WEBHOOK_SECRET")
    expected_auth = os.environ.get("REVENUECAT_WEBHOOK_AUTH")

    if not secret and not expected_auth:
        print("Set REVENUECAT_WEBHOOK_SECRET and/or REVENUECAT_WEBHOOK_AUTH")
        return JSONResponse({"error": "Webhook verification not configured"}, status_code=500)

    # Read the raw body: the signature covers these exact bytes.
    raw_body = await request.body()

    # 1. Static Authorization header (when configured on the integration).
    if expected_auth:
        ok, error = verify_authorization_header(request.headers.get("authorization"), expected_auth)
        if not ok:
            print(f"RevenueCat webhook authorization failed: {error}")
            return JSONResponse({"error": error}, status_code=401)

    # 2. HMAC signature (when "HMAC webhook signing" is enabled).
    if secret:
        ok, error = verify_revenuecat_signature(
            raw_body, request.headers.get("x-revenuecat-webhook-signature"), secret
        )
        if not ok:
            print(f"RevenueCat webhook verification failed: {error}")
            return JSONResponse({"error": error}, status_code=401)

    # 3. Parse only after verifying the raw body.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON payload"}, status_code=400)
    event = payload.get("event") if isinstance(payload, dict) else None
    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        return JSONResponse({"error": "Missing event"}, status_code=400)

    # In production: dedupe on event["id"] (retries reuse it), store the event,
    # return 200, then process asynchronously.
    handle_event(event)

    # RevenueCat treats any status other than 200 as a failure.
    return JSONResponse({"received": True}, status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
