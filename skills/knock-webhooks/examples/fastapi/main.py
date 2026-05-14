# Generated with: knock-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

FIVE_MINUTES_MS = 5 * 60 * 1000

webhook_secret = os.environ.get("KNOCK_WEBHOOK_SECRET")


def verify_knock_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance_ms: int = FIVE_MINUTES_MS,
) -> tuple[bool, str | None]:
    """Verify the x-knock-signature header.

    Header format:  t=<timestamp_ms>,s=<base64_signature>
    Signed content: f"{timestamp_ms}.{raw_body_str}"
    Algorithm:      HMAC-SHA256 with the per-endpoint signing secret, base64.

    NOTE: Knock's timestamp is in MILLISECONDS (Stripe's looks identical but uses
    seconds). Anyone porting a Stripe verifier will silently fail without this fix.
    """
    if not header:
        return False, "Missing x-knock-signature header"

    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp_ms = parts.get("t")
    signature = parts.get("s")
    if not timestamp_ms or not signature:
        return False, "Malformed x-knock-signature header"

    try:
        ts = int(timestamp_ms)
    except ValueError:
        return False, "Malformed x-knock-signature header"

    now_ms = int(time.time() * 1000)
    if abs(now_ms - ts) > tolerance_ms:
        return False, "Timestamp outside tolerance"

    signed_content = f"{timestamp_ms}.{raw_body.decode('utf-8')}"
    expected = base64.b64encode(
        hmac.new(
            secret.encode("utf-8"), signed_content.encode("utf-8"), hashlib.sha256
        ).digest()
    ).decode("utf-8")

    if not hmac.compare_digest(signature, expected):
        return False, "Invalid signature"
    return True, None


@app.post("/webhooks/knock")
async def knock_webhook(request: Request):
    raw_body = await request.body()
    header = request.headers.get("x-knock-signature")

    valid, error = verify_knock_signature(raw_body, header, webhook_secret)
    if not valid:
        raise HTTPException(status_code=400, detail=f"Webhook Error: {error}")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("type")
    data = event.get("data") or {}
    event_data = event.get("event_data") or {}

    # Knock delivers at-least-once and retries up to 8 times — use event["id"]
    # as the idempotency key in real handlers.
    if event_type == "message.sent":
        print(f"Message sent: {data.get('id')}")
    elif event_type == "message.delivered":
        print(f"Message delivered: {data.get('id')}")
    elif event_type == "message.delivery_attempted":
        print(f"Delivery attempted: {data.get('id')}")
    elif event_type == "message.undelivered":
        print(f"Message undelivered: {data.get('id')}")
    elif event_type == "message.bounced":
        print(f"Message bounced: {data.get('id')}")
    elif event_type == "message.seen":
        print(f"Message seen: {data.get('id')}")
    elif event_type == "message.unseen":
        print(f"Message unseen: {data.get('id')}")
    elif event_type == "message.read":
        print(f"Message read: {data.get('id')}")
    elif event_type == "message.unread":
        print(f"Message unread: {data.get('id')}")
    elif event_type == "message.archived":
        print(f"Message archived: {data.get('id')}")
    elif event_type == "message.unarchived":
        print(f"Message unarchived: {data.get('id')}")
    elif event_type == "message.interacted":
        print(f"Message interacted: {data.get('id')}")
    elif event_type == "message.link_clicked":
        print(f"Link clicked: {data.get('id')} -> {event_data.get('url')}")
    elif event_type in ("workflow.updated", "workflow.committed"):
        print(f"Workflow {event_type.split('.')[1]}: {data.get('key')}")
    elif event_type in ("email_layout.updated", "email_layout.committed"):
        print(f"Email layout {event_type.split('.')[1]}: {data.get('key')}")
    elif event_type in ("translation.updated", "translation.committed"):
        print(
            f"Translation {event_type.split('.')[1]}: {data.get('locale_code')}"
        )
    elif event_type in (
        "source_event_action.updated",
        "source_event_action.committed",
    ):
        print(
            f"Source event action {event_type.split('.')[1]}: {data.get('key')}"
        )
    elif event_type in ("partial.updated", "partial.committed"):
        print(f"Partial {event_type.split('.')[1]}: {data.get('key')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
