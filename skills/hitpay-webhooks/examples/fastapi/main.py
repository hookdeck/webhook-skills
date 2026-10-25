# Generated with: hitpay-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_hitpay_signature(raw_body: bytes, signature, salt=None) -> bool:
    """HitPay event webhooks: Hitpay-Signature is the hex HMAC-SHA256 of the raw
    body, keyed with that webhook endpoint's salt (Developers > Webhooks).
    Legacy payment-request/charge callbacks (an "hmac" field in the payload,
    API-key salt) use a different scheme and are not handled here.
    """
    salt = salt if salt is not None else os.environ.get("HITPAY_WEBHOOK_SALT")
    if not salt:
        return False  # never accept when unconfigured
    if not signature:
        return False
    expected = hmac.new(salt.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500.
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def handle_event(event_name: str, data: dict) -> None:
    """The body carries no event name. Dispatch on "{Hitpay-Event-Object}.{Hitpay-Event-Type}"."""
    if event_name == "charge.created":
        print(f"Charge created: {data.get('id')} ({data.get('currency')} {data.get('amount')}, status {data.get('status')})")
        # TODO: fulfil the order, keyed on data["id"] (webhooks can repeat)

    elif event_name == "charge.updated":
        print(f"Charge updated: {data.get('id')} (refunded {data.get('refunded_amount')})")
        # TODO: record the refund / partial refund

    elif event_name == "order.created":
        print(f"Order created: {data.get('id')}")
        # TODO: create the order in your system

    elif event_name == "order.updated":
        print(f"Order updated: {data.get('id')} (status {data.get('status')})")
        # TODO: sync the order status

    elif event_name == "invoice.created":
        print(f"Invoice created: {data.get('id')}")
        # TODO: store the invoice

    elif event_name == "invoice.updated":
        print(f"Invoice updated: {data.get('id')}")
        # TODO: sync the invoice

    elif event_name == "payout.created":
        print(f"Payout created: {data.get('id')}")
        # TODO: reconcile the payout

    elif event_name in (
        "transfer.created",
        "transfer.updated",
        "transfer.processing",
        "transfer.scheduled",
        "transfer.canceled",
    ):
        print(f"{event_name}: {data.get('id')} (status {data.get('status')})")
        # TODO: update the transfer status

    elif event_name == "transfer.paid":
        print(f"Transfer paid: {data.get('id')}")
        # TODO: mark the transfer as paid

    elif event_name == "transfer.failed":
        print(f"Transfer failed: {data.get('id')}")
        # TODO: alert finance

    else:
        print(f"Unhandled HitPay event: {event_name}")


@app.post("/webhooks/hitpay")
async def hitpay_webhook(request: Request):
    raw_body = await request.body()  # raw bytes, whatever the content type

    if not verify_hitpay_signature(raw_body, request.headers.get("hitpay-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing Hitpay-Signature")

    obj = request.headers.get("hitpay-event-object")
    event_type = request.headers.get("hitpay-event-type")
    if not obj or not event_type:
        raise HTTPException(status_code=400, detail="Missing Hitpay-Event-Object or Hitpay-Event-Type")

    try:
        data = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(f"{obj}.{event_type}".lower(), data)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling HitPay webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
