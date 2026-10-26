# Generated with: memberful-webhooks skill
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

SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")


def verify_memberful_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Verify the X-Memberful-Webhook-Signature header: lowercase hex HMAC-SHA256 of the raw body bytes,
    keyed with the webhook secret's UTF-8 bytes. Nothing else is signed (no timestamp, no id).
    """
    secret = secret if secret is not None else os.environ.get("MEMBERFUL_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str):
        return False
    # Validate length and alphabet before decoding.
    if not SIGNATURE_RE.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # case-insensitive, as Hookdeck does
    return hmac.compare_digest(received, expected)  # bytes, never str


def text(value):
    """Parsed fields are untrusted: only use values of the expected type."""
    return value if isinstance(value, str) else None


def id_of(value):
    """The id of a nested object, or None if the object or its id has an unexpected type."""
    if not isinstance(value, dict):
        return None
    ident = value.get("id")
    if isinstance(ident, bool) or not isinstance(ident, (str, int)):
        return None
    return ident


# Memberful's event reference lists these names but never shows where the name travels.
# ASSUMPTION: a top-level `event` field. Confirm against a real delivery (Settings > Webhooks > test).
def handle_event(payload: dict) -> None:
    event = text(payload.get("event"))

    if event == "member_signup":
        print(f"Member signed up: {id_of(payload.get('member'))}")
        # TODO: create the member in your app

    elif event in ("member_updated", "member.deleted", "tax_id.updated", "custom_fields.updated"):
        print(f"{event}: member {id_of(payload.get('member'))}")
        # TODO: sync or remove the member's profile

    elif event in (
        "subscription.created",
        "subscription.renewed",
        "subscription.activated",
        "subscription.reactivated",
    ):
        print(f"{event}: subscription {id_of(payload.get('subscription'))}")
        # TODO: grant or extend the member's access

    elif event == "subscription.updated":
        # `changed` maps field -> [old, new]; a plan_id entry means a plan change.
        print(f"subscription.updated: subscription {id_of(payload.get('subscription'))}")
        # TODO: re-fetch the subscription from the API (delivery order is not guaranteed)

    elif event in ("subscription.deactivated", "subscription.deleted"):
        print(f"{event}: subscription {id_of(payload.get('subscription'))}")
        # TODO: remove the member's access

    elif event in ("order.purchased", "order.refunded", "order.suspended", "order.completed"):
        print(f"{event}: order {id_of(payload.get('order'))}")
        # TODO: record the order or refund

    elif event in (
        "subscription_plan.created",
        "subscription_plan.updated",
        "subscription_plan.deleted",
        "download.created",
        "download.updated",
        "download.deleted",
    ):
        print(f"{event} received")
        # TODO: sync prices (subscription_plan.*) or downloads

    else:
        print(f"Unhandled event: {event} (keys: {', '.join(payload)})")


# Memberful sends POST only (other methods get 405 from FastAPI).
@app.post("/webhooks/memberful")
async def memberful_webhook(request: Request):
    # Raw bytes, never decoded and re-encoded.
    raw_body = await request.body()

    if not verify_memberful_signature(raw_body, request.headers.get("x-memberful-webhook-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Memberful-Webhook-Signature")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Memberful webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
