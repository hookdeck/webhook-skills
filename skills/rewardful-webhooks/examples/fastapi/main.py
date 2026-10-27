# Generated with: rewardful-webhooks skill
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

# In-memory dedupe for the example; use a durable store (Redis, database) in production.
seen_events: set = set()

_HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_rewardful_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Rewardful signs the raw body: X-Rewardful-Signature = lowercase hex HMAC-SHA256 of the
    request body, keyed with the endpoint's Signing Secret (UTF-8 bytes, no prefix).
    Nothing else is signed, so there is no timestamp or replay window to check.
    """
    secret = secret if secret is not None else os.environ.get("REWARDFUL_WEBHOOK_SECRET", "")
    if not secret or not isinstance(raw_body, bytes):
        return False
    # Validate before decoding: exact length and alphabet.
    if not signature or not _HEX_64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    # Bytes, not str: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(expected, bytes.fromhex(signature))


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    event_type = event.get("type") if isinstance(event, dict) else None
    obj = payload.get("object")
    obj = obj if isinstance(obj, dict) else {}

    if event_type == "affiliate.created":
        print(f"Affiliate created: {obj.get('email')} ({obj.get('id')})")
        # TODO: create a CRM contact

    elif event_type == "affiliate.confirmed":
        print(f"Affiliate confirmed: {obj.get('email')} ({obj.get('id')})")
        # TODO: send onboarding

    elif event_type == "referral.lead":
        print(f"Referral became a lead: {obj.get('id')}")
        # TODO: track the funnel

    elif event_type == "referral.converted":
        print(f"Referral converted: {obj.get('id')}")
        # TODO: attribute revenue to the affiliate

    elif event_type == "sale.created":
        print(f"Sale created: {obj.get('id')}")
        # TODO: record the sale

    elif event_type == "sale.refunded":
        print(f"Sale refunded: {obj.get('id')}")
        # TODO: reverse attribution

    elif event_type == "commission.created":
        print(f"Commission created: {obj.get('id')}")
        # TODO: record the liability

    elif event_type == "commission.paid":
        print(f"Commission paid: {obj.get('id')}")
        # TODO: notify the affiliate

    elif event_type == "payout.due":
        print(f"Payout due: {obj.get('id')}")
        # TODO: queue finance work

    elif event_type == "payout.paid":
        print(f"Payout paid: {obj.get('id')}")
        # TODO: mark as settled

    elif event_type == "payout.failed":
        print(f"Payout failed: {obj.get('id')}")
        # TODO: alert finance

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/rewardful")
async def rewardful_webhook(request: Request):
    # Raw bytes, any content type: the exact body is what Rewardful signed.
    raw_body = await request.body()
    signature = request.headers.get("x-rewardful-signature")

    if not verify_rewardful_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    # Retries redeliver the same event; acknowledge repeats without reprocessing.
    event = payload.get("event")
    event_id = event.get("id") if isinstance(event, dict) else None
    if event_id and event_id in seen_events:
        return {"received": True, "duplicate": True}

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Rewardful event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_events.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
