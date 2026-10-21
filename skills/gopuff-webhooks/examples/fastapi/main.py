# Generated with: gopuff-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Gopuff Webhook Handler")

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set GOPUFF_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("GOPUFF_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "GOPUFF_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


class WebhookVerificationError(Exception):
    pass


def verify_svix_signature(raw_body: bytes, headers, secret: str, tolerance: int | None = None) -> None:
    """Verify a Svix-signed delivery (the Standard Webhooks scheme); raise if it's invalid.

    Written out rather than calling the `svix` SDK, because the SDK always enforces a
    5-minute timestamp window. Hookdeck retries and replays carry the original
    svix-timestamp, so that window would reject them. Here the window is opt-in via
    GOPUFF_TIMESTAMP_TOLERANCE_SECONDS.
    """
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        raise WebhookVerificationError("Missing Svix signature headers")
    if not (timestamp.isascii() and timestamp.isdigit()):
        raise WebhookVerificationError("Invalid svix-timestamp")
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        raise WebhookVerificationError("Timestamp outside tolerance")

    # Key = base64-decoded secret after the whsec_ prefix
    try:
        key = base64.b64decode(secret[len("whsec_"):] if secret.startswith("whsec_") else secret)
    except (binascii.Error, ValueError) as exc:
        raise WebhookVerificationError("Secret is not valid base64") from exc
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    # svix-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return
    raise WebhookVerificationError("No matching signature")


def classify(event) -> str:
    """Gopuff payloads carry no event-type field, so classify them by shape.

    order.status / order.status.v2 / order.delivered -> {"order": {...}}
    Delivery Status -> {"driver": {...}}; Delivery ETA -> {"expected_delivery_time": {...}}
    """
    if isinstance(event.get("order"), dict):
        return "order"
    if event.get("driver"):
        return "delivery_status"
    if event.get("expected_delivery_time"):
        return "delivery_eta"
    return "unknown"


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/gopuff")
async def gopuff_webhook(
    request: Request,
    # Svix sends svix-* headers; white-labeled accounts use webhook-*.
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None),
    webhook_id: str = Header(None),
    webhook_timestamp: str = Header(None),
    webhook_signature: str = Header(None),
):
    msg_id = svix_id or webhook_id
    timestamp = svix_timestamp or webhook_timestamp
    signature = svix_signature or webhook_signature
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    secret = os.environ.get("GOPUFF_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify against the RAW body, never a re-serialized payload.
    body = await request.body()
    try:
        # Signed content is f"{id}.{timestamp}.{body}"; every v1 signature is checked in
        # constant time. The timestamp window is opt-in (GOPUFF_TIMESTAMP_TOLERANCE_SECONDS).
        verify_svix_signature(
            body,
            {"svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": signature},
            secret,
        )
    except WebhookVerificationError as err:
        print(f"Webhook verification failed: {err}")
        detail = "Timestamp too old" if "outside tolerance" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # svix-id is stable across retries: use it as the idempotency key.
    kind = classify(event)
    if kind == "order":
        order = event["order"]
        status = order.get("status")
        print(f"Order status (order.status.v2): {order.get('partner_order_id')} -> {status}")
        if status == "Finished":
            print(f"Order delivered (order.delivered): {order.get('partner_order_id')}")
        elif status == "Cancelled":
            print(f"Order cancelled: {order.get('cancel_reason')}")
    elif kind == "delivery_status":
        print(f"Driver location: {event['driver'].get('location')}")
    elif kind == "delivery_eta":
        print(f"Delivery ETA: {event['expected_delivery_time']}")
    else:
        print("Unhandled Gopuff payload")

    return JSONResponse(content={"success": True, "kind": kind, "svixId": msg_id}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
