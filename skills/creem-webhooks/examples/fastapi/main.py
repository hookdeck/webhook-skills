# Generated with: creem-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()


def verify_creem_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Creem sends creem-signature: bare lowercase hex HMAC-SHA256 of the raw request
    body, keyed with the endpoint's signing secret used as a UTF-8 string (no prefix, no timestamp).
    Both sides are compared as bytes: compare_digest raises TypeError on a non-ASCII str,
    which would turn a bad header into a 500 instead of a 401. Hex is case-insensitive, so the
    header is lowercased first."""
    if secret is None:
        secret = os.environ.get("CREEM_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def handle_event(body: dict) -> None:
    event_type = body.get("eventType")
    resource = _as_dict(body.get("object"))

    if event_type == "checkout.completed":
        print("Checkout completed", resource.get("id"), _as_dict(resource.get("order")).get("id"))
        # TODO: fulfil the order; resource["metadata"] / resource["request_id"] carry your own reference

    elif event_type == "subscription.paid":
        print("Subscription paid", resource.get("id"))
        # TODO: grant or extend access (Creem recommends this event over subscription.active)

    elif event_type in (
        "subscription.active",
        "subscription.trialing",
        "subscription.update",
        "subscription.paused",
    ):
        print(f"Subscription state change ({event_type})", resource.get("id"), resource.get("status"))
        # TODO: sync the subscription record

    elif event_type == "subscription.scheduled_cancel":
        print("Subscription scheduled to cancel", resource.get("id"), resource.get("current_period_end_date"))
        # TODO: notify the customer or offer a retention incentive

    elif event_type in ("subscription.past_due", "subscription.unpaid"):
        print(f"Subscription payment problem ({event_type})", resource.get("id"))
        # TODO: prompt for a payment-method update; suspend access per your policy

    elif event_type in ("subscription.canceled", "subscription.expired"):
        print(f"Subscription ended ({event_type})", resource.get("id"))
        # TODO: revoke access

    elif event_type == "refund.created":
        print("Refund created", resource.get("id"), resource.get("refund_amount"), resource.get("refund_currency"))

    elif event_type == "dispute.created":
        print("Dispute created", resource.get("id"), resource.get("amount"), resource.get("currency"))
        # TODO: alert your team

    elif event_type in (
        "credits.granted",
        "credits.consumed",
        "credits.auto_recharged",
        "customer_credits.exhausted",
    ):
        print(f"Customer credits event ({event_type})", resource.get("customer_id"), resource.get("bucket_name"))

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/creem")
async def creem_webhook(request: Request):
    # Raw bytes, whatever the content type: the signature covers exactly these.
    raw_body = await request.body()

    if not verify_creem_signature(raw_body, request.headers.get("creem-signature")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Creem event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
