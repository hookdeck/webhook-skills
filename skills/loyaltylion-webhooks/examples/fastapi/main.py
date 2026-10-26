# Generated with: loyaltylion-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

# x-loyaltylion-hmac-sha256 is the bare, padded, standard-base64 HMAC-SHA256 digest (44 chars).
SIGNATURE_FORMAT = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_loyaltylion_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Verify the x-loyaltylion-hmac-sha256 header.

    Signature = base64(HMAC-SHA256(secret, raw_body)): the raw body bytes only, key = the
    secret's UTF-8 bytes. The format is checked first, then the base64 strings are compared
    exactly (as bytes), in constant time.
    """
    if not secret or not signature or not SIGNATURE_FORMAT.fullmatch(signature):
        return False
    expected = base64.b64encode(hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest())
    return hmac.compare_digest(signature.encode("ascii"), expected)


def get_topic(body: dict) -> Optional[str]:
    """Envelope webhooks carry `topic`. rewards/store_fulfilment (sent to a custom reward's
    fulfilment URL) has no envelope and no topic: its body is the flat fulfilment object."""
    if isinstance(body.get("topic"), str):
        return body["topic"]
    if "reward_fulfilment_id" in body:
        return "rewards/store_fulfilment"
    return None


def get_data(body: dict) -> dict:
    """The docs' customers/update example puts `customer` at the top level, not under `payload`."""
    payload = body.get("payload")
    return payload if isinstance(payload, dict) else body


def get_customer(data: dict) -> dict:
    """program_events/* payloads nest their fields under `properties`."""
    customer = data.get("customer")
    if not isinstance(customer, dict):
        properties = data.get("properties")
        customer = properties.get("customer") if isinstance(properties, dict) else None
    return customer if isinstance(customer, dict) else {}


def handle_event(topic: Optional[str], body: dict) -> None:
    data = get_data(body)
    customer = get_customer(data)

    if topic == "customers/update":
        print(f"Customer {customer.get('id')} updated ({customer.get('points_approved')} points approved)")
        # TODO: sync the customer's points balance and tier to your system
    elif topic == "program_events/customer.enrolled":
        print(f"Customer {customer.get('id')} enrolled in the loyalty program")
        # TODO: send a welcome message or tag the customer
    elif topic == "program_events/customer.points_earned":
        print(f"Customer {customer.get('id')} earned points")
        # TODO: record the transaction (data["properties"]["transaction"])
    elif topic in ("program_events/customer.tier_upgraded", "program_events/customer.tier_downgraded"):
        print(f"Customer {customer.get('id')} tier changed ({topic.rsplit('.', 1)[-1]})")
        # TODO: update tier-based perks
    elif topic == "program_events/customer.claimed_reward":
        print(f"Customer {customer.get('id')} claimed a reward")
        # TODO: fulfil or record the reward (voucher_code, discount_amount, ...)
    elif topic == "program_events/customer.referral_complete":
        print(f"Referral completed for customer {customer.get('id')}")
    elif topic == "loyalty_emails/unsubscribe":
        unsubscribed = (data.get("unsubscribe") or {}).get("customer") or {}
        print(f"Customer {unsubscribed.get('id')} unsubscribed from loyalty emails")
        # TODO: suppress loyalty emails for this customer
    elif topic == "receipts/manual_approval_required":
        print(f"Receipt {(data.get('receipt') or {}).get('id')} needs manual review")
    elif topic == "rewards/store_fulfilment":
        # A 2xx response marks this redemption as successfully fulfilled. `test: true` is sent
        # when you create or update the custom reward, to confirm the URL works.
        suffix = " (test)" if body.get("test") else ""
        print(f"Fulfilment {body.get('reward_fulfilment_id')} for reward {body.get('reward_identifier')}{suffix}")
        # TODO: grant the custom reward to body["customer_id"]
    else:
        print(f"Unhandled LoyaltyLion topic: {topic}")


@app.post("/webhooks/loyaltylion")
async def loyaltylion_webhook(request: Request):
    secret = os.getenv("LOYALTYLION_WEBHOOK_SECRET")
    if not secret:
        print("LOYALTYLION_WEBHOOK_SECRET is not set")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the exact bytes; parse only after the signature check.
    raw_body = await request.body()
    if not verify_loyaltylion_signature(raw_body, request.headers.get("x-loyaltylion-hmac-sha256"), secret):
        return JSONResponse({"error": "Invalid or missing signature"}, status_code=401)

    try:
        body: Any = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)
    if not isinstance(body, dict):
        return JSONResponse({"error": "Expected a JSON object"}, status_code=400)

    # At-least-once delivery: dedupe on body["id"] (envelope webhooks) before doing real work.
    try:
        handle_event(get_topic(body), body)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling LoyaltyLion webhook: {exc}")
        return JSONResponse({"error": "Handler error"}, status_code=500)

    # LoyaltyLion needs a 200 within 5 seconds, otherwise the delivery counts as failed
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
