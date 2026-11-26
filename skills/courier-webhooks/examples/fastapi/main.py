# Generated with: courier-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

WEBHOOK_SECRET = os.environ.get("COURIER_WEBHOOK_SECRET", "")


def to_millis(timestamp: str):
    """Normalize the `t` value from courier-signature to milliseconds.

    Courier documents `t` as a millisecond timestamp. As a safeguard, a
    ~10-digit value is treated as seconds and a ~13-digit value as
    milliseconds. Only the staleness check needs this - the HMAC always covers
    the `t` string exactly as received.

    Returns None if the value is not an integer.
    """
    try:
        value = int(timestamp)
    except ValueError:
        return None
    return value * 1000 if abs(value) < 100_000_000_000 else value


def verify_courier_signature(
    raw_body: bytes,
    signature_header: str | None,
    secret: str,
    tolerance_ms: int = 5 * 60 * 1000,
) -> bool:
    """Verify a Courier outbound webhook signature.

    Courier signs each webhook with HMAC-SHA256. The `courier-signature` header
    looks like `t=<timestamp>,signature=<hex_digest>`, and the signed content is
    `<timestamp>.<raw_body>` (timestamp + "." + the raw request body).

    Courier's docs write the signed content as `${t}.${JSON.stringify(body)}`;
    we use the raw body instead. The two are byte-identical for a delivery you
    have not modified, and the raw body avoids re-serialization drift.

    `tolerance_ms` defaults to 5 minutes - our choice, not a window Courier
    publishes.
    """
    if not signature_header:
        return False

    # Parse "t=<timestamp>,signature=<hex>"
    parts: dict[str, str] = {}
    for segment in signature_header.split(","):
        key, _, value = segment.partition("=")
        parts[key.strip()] = value.strip()

    timestamp = parts.get("t")
    signature = parts.get("signature")
    if not timestamp or not signature:
        return False

    # Reject stale deliveries (accepts a seconds or milliseconds timestamp)
    ts = to_millis(timestamp)
    if ts is None:
        return False
    if abs(int(time.time() * 1000) - ts) > tolerance_ms:
        return False

    # Recompute HMAC over "<timestamp>.<raw_body>"
    signed_payload = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()

    # Constant-time comparison to prevent timing attacks
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/courier")
async def courier_webhook(request: Request):
    # Read the raw body for signature verification (do not parse before verifying)
    raw_body = await request.body()
    signature = request.headers.get("courier-signature")

    if not verify_courier_signature(raw_body, signature, WEBHOOK_SECRET):
        print("Courier webhook signature verification failed")
        return Response(content="Invalid signature", status_code=400)

    # Parse the payload only after verification (envelope: { type, data })
    event = json.loads(raw_body)
    event_type = event.get("type")
    data = event.get("data", {})

    if event_type == "message:updated":
        # Courier does NOT emit per-status events - status lives in `data`.
        # Statuses: ENQUEUED, SENT, DELIVERED, OPENED, CLICKED, UNROUTABLE,
        # UNDELIVERABLE. Keep a fallback for values you don't recognize.
        print(f"Message updated: {data.get('id')} status={data.get('status')}")
        # Your code: Sync delivery status, retry, analytics, etc.

    elif event_type == "notification:submitted":
        print(f"Notification submitted: {data.get('id')}")
        # Your code: Record send in flight, audit trail, etc.

    elif event_type == "notification:submission_canceled":
        print(f"Notification submission canceled: {data.get('id')}")
        # Your code: Reconcile canceled send, etc.

    elif event_type == "notification:published":
        print(f"Notification published: {data.get('id')}")
        # Your code: Invalidate template cache, sync versions, etc.

    elif event_type == "audiences:updated":
        print(f"Audience updated: {data.get('id')}")
        # Your code: Sync segment definition, etc.

    elif event_type == "audiences:user:matched":
        print(f"User matched audience: {data.get('audience_id')} {data.get('user_id')}")
        # Your code: Trigger onboarding, tag user, etc.

    elif event_type == "audiences:user:unmatched":
        print(f"User unmatched audience: {data.get('audience_id')} {data.get('user_id')}")
        # Your code: Revoke access, update CRM, etc.

    elif event_type == "audiences:calculated":
        print(f"Audience calculated: {data.get('audience_id')}")
        # Your code: Kick off downstream jobs, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 quickly to acknowledge receipt; do heavy work async
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
