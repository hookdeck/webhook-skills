# Generated with: paymob-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

# The keys Paymob signs, in the documented order, per callback `type`.
# TRANSACTION: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback
# TOKEN: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-for-card-tokens
HMAC_FIELDS = {
    "TRANSACTION": [
        "amount_cents",
        "created_at",
        "currency",
        "error_occured",
        "has_parent_transaction",
        "id",
        "integration_id",
        "is_3d_secure",
        "is_auth",
        "is_capture",
        "is_refunded",
        "is_standalone_payment",
        "is_voided",
        "order.id",
        "owner",
        "pending",
        "source_data.pan",
        "source_data.sub_type",
        "source_data.type",
        "success",
    ],
    "TOKEN": [
        "card_subtype",
        "created_at",
        "email",
        "id",
        "masked_pan",
        "merchant_id",
        "order_id",
        "token",
    ],
}


def _stringify(value) -> str:
    """Render a value as the docs' worked examples do: booleans as lowercase
    true/false, numbers as their digits, a missing value as an empty string."""
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return ""
    return str(value)


def _get(obj: dict, path: str):
    """Resolve a dotted key path (e.g. 'order.id', 'source_data.pan')."""
    current = obj
    for part in path.split("."):
        current = current.get(part) if isinstance(current, dict) else None
    return current


def build_signed_string(callback_type: str, obj: dict):
    """The values of the keys for this `type`, joined in order with no separator.
    None for a type with no documented key list."""
    fields = HMAC_FIELDS.get(callback_type)
    if fields is None:
        return None
    return "".join(_stringify(_get(obj, field)) for field in fields)


def verify_paymob_hmac(body: dict, hmac_param: str, secret: str) -> bool:
    """Verify a Paymob callback.

    Paymob computes HMAC-SHA512 (hex) over the string above and sends it as the
    `hmac` query parameter (not a header, not the raw body).
    """
    signed = build_signed_string(body.get("type"), body.get("obj") or {})
    if signed is None or not hmac_param or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), signed.encode("utf-8"), hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, hmac_param.lower())


def transaction_state(obj: dict) -> str:
    """A transaction's state, from its booleans. Paymob sends no event name for
    the outcome: success false with pending false is a decline."""
    if obj.get("is_refunded"):
        return "refunded"
    if obj.get("is_voided"):
        return "voided"
    if obj.get("pending"):
        return "pending"
    if obj.get("success") and obj.get("is_auth") and not obj.get("is_capture"):
        return "authorized"
    if obj.get("is_capture"):
        return "captured"
    if obj.get("success"):
        return "succeeded"
    return "declined"


@app.post("/webhooks/paymob")
async def paymob_webhook(request: Request):
    hmac_param = request.query_params.get("hmac")

    # Parse the JSON: verification needs the individual fields.
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(body, dict) or not body.get("obj") or body.get("type") not in HMAC_FIELDS:
        raise HTTPException(status_code=400, detail="Unexpected callback payload")

    secret = os.environ.get("PAYMOB_HMAC_SECRET", "")
    if not verify_paymob_hmac(body, hmac_param, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    obj = body["obj"]

    if body["type"] == "TOKEN":
        # A customer saved a card. Your code: store obj["token"] against obj["order_id"].
        print(f"Card token {obj.get('id')} for order {obj.get('order_id')}")
        return {"received": True}

    state = transaction_state(obj)
    print(f"Transaction {obj.get('id')} (order {(obj.get('order') or {}).get('id')}): {state}")

    if state == "succeeded":
        pass  # Your code: mark the order paid, fulfil, send a receipt
    elif state == "declined":
        pass  # Your code: tell the customer, release the reservation
    elif state == "pending":
        pass  # Your code: wait for a later callback (OTP page, kiosk or cash payment)
    elif state == "authorized":
        pass  # Your code: funds held; capture when ready
    elif state == "captured":
        pass  # Your code: complete a prior authorization
    elif state == "refunded":
        pass  # Your code: reverse fulfilment, credit the customer
    elif state == "voided":
        pass  # Your code: cancel an uncaptured authorization

    # Acknowledge quickly; do slow work in the background.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
