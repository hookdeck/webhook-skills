# Generated with: terminal49-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

# In-memory dedupe for the example. Use a shared store (Redis, a database unique key) in production.
processed_notification_ids: set = set()


def verify_terminal49_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Terminal49 signs the raw request body with HMAC-SHA256, keyed with the webhook's `secret`
    (UTF-8 bytes, used as-is), and sends the bare hex digest in X-T49-Webhook-Signature.
    No timestamp is signed, so there is no replay window to check.
    """
    secret = secret if secret is not None else os.environ.get("TERMINAL49_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    # Validate the format first (exact length and alphabet) before decoding.
    if not isinstance(signature, str) or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # hex is case-insensitive
    # Compare bytes, never str: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received, expected)


def handle_notification(payload: dict) -> None:
    data = payload["data"]
    included = payload.get("included") or []
    event = data["attributes"]["event"]  # data.type is always "webhook_notification"
    reference_type = ((data.get("relationships") or {}).get("reference_object") or {}).get("data", {}).get("type")

    if event in ("tracking_request.succeeded", "tracking_request.failed"):
        request = next((r for r in included if r.get("type") == "tracking_request"), {})
        print(f"{event} ({reference_type}) {(request.get('attributes') or {}).get('request_number', '')}")
        # TODO: mark the tracking request done, or surface request attributes.failed_reason

    elif event in (
        "container.transport.vessel_arrived",
        "container.transport.vessel_departed",
        "container.transport.available",
    ):
        container = next((r for r in included if r.get("type") == "container"), {})
        print(f"{event} for container {(container.get('attributes') or {}).get('number')}")
        # TODO: update your container milestone from the transport_event in `included`

    elif event in ("container.updated", "shipment.estimated.arrival"):
        print(f"{event} ({reference_type})")
        # TODO: re-fetch the container or shipment from the REST API for the latest ETA/state

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/terminal49")
async def terminal49_webhook(request: Request):
    # Read the raw bytes (any content type) and verify before parsing.
    raw_body = await request.body()
    signature = request.headers.get("x-t49-webhook-signature")

    if not verify_terminal49_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid or missing X-T49-Webhook-Signature")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    data = payload.get("data") if isinstance(payload, dict) else None
    attributes = data.get("attributes") if isinstance(data, dict) else None
    if not isinstance(attributes, dict) or not isinstance(attributes.get("event"), str):
        raise HTTPException(status_code=400, detail="Expected data.attributes.event")

    # Retries can deliver the same notification more than once: data.id is the idempotency key.
    notification_id = data.get("id")
    if notification_id and notification_id in processed_notification_ids:
        print(f"Duplicate notification {notification_id}, skipping")
        return {"received": True}

    try:
        handle_notification(payload)
        if notification_id:
            processed_notification_ids.add(notification_id)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Terminal49 notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")  # Terminal49 retries non-2xx

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
