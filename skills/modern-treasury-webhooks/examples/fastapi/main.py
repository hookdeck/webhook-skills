import hashlib
import hmac
import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

# Webhook IDs we have already processed. Use a database or Redis in production.
processed_webhooks: set[str] = set()


def verify_signature(raw_body: bytes, signature: Optional[str], webhook_key: Optional[str]) -> bool:
    """Verify X-Signature: lowercase hex HMAC-SHA256 of the RAW request body,
    keyed with the webhook key as a plain UTF-8 string."""
    if not signature or not webhook_key:
        return False

    expected = hmac.new(webhook_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.strip().lower().encode(), expected.encode())


async def verified_body(
    request: Request,
    x_signature: Optional[str] = Header(default=None),
) -> bytes:
    """Dependency: read the raw body and reject the request unless it is signed."""
    webhook_key = os.environ.get("MODERN_TREASURY_WEBHOOK_KEY")
    if not webhook_key:
        raise HTTPException(status_code=500, detail="Webhook key not configured")
    if not x_signature:
        raise HTTPException(status_code=400, detail="Missing X-Signature header")

    # Use the raw bytes: the signature covers the exact body sent.
    raw_body = await request.body()
    if not verify_signature(raw_body, x_signature, webhook_key):
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


def handle_event(topic: Optional[str], event: Optional[str], data: dict[str, Any]) -> None:
    """Dispatch on "<topic>.<event>": the topic comes from the X-Topic header and
    the event name from the body's `event` field."""
    key = f"{topic}.{event}"
    obj_id = data.get("id")

    if key in (
        "payment_order.created",
        "payment_order.approved",
        "payment_order.begin_processing",
        "payment_order.finish_processing",
    ):
        print(f"Payment order {obj_id} is {event}")
    elif key == "payment_order.completed":
        print(f"Payment order {obj_id} completed (funds accepted by the bank)")
    elif key == "payment_order.reconciled":
        print(f"Payment order {obj_id} reconciled (settled)")
    elif key in ("payment_order.failed", "payment_order.returned"):
        print(f"Payment order {obj_id} {event}", data.get("status"))
    elif key in (
        "expected_payment.reconciled",
        "expected_payment.partially_reconciled",
        "expected_payment.overdue",
    ):
        print(f"Expected payment {obj_id} {event}")
    elif key in ("incoming_payment_detail.completed", "incoming_payment_detail.reconciled"):
        print(f"Incoming payment {obj_id} {event}")
    elif key in ("transaction.created", "transaction.reconciled"):
        print(f"Transaction {obj_id} {event}")
    elif key in ("return.created", "return.completed", "reversal.completed"):
        print(f"{topic} {obj_id} {event}")
    else:
        print(f"Unhandled event: {key}")


@app.post("/webhooks/modern-treasury")
async def modern_treasury_webhook(
    raw_body: bytes = Depends(verified_body),
    x_topic: Optional[str] = Header(default=None),
    x_webhook_id: Optional[str] = Header(default=None),
):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # X-Webhook-ID stays the same across retries of one webhook
    if x_webhook_id and x_webhook_id in processed_webhooks:
        return {"received": True, "duplicate": True}

    try:
        handle_event(x_topic, payload.get("event"), payload.get("data") or {})
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling webhook: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    if x_webhook_id:
        processed_webhooks.add(x_webhook_id)
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
