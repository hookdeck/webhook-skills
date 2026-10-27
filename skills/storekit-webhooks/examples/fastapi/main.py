# Generated with: storekit-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Storekit Webhook Handler")


def as_dict(value):
    return value if isinstance(value, dict) else {}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/storekit")
async def storekit_webhook(request: Request):
    secret = os.environ.get("STOREKIT_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("STOREKIT_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Storekit (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library accepts either header-name set, so hand it the resolved values under both.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:
        # A malformed signature entry raises a plain ValueError rather than WebhookVerificationError
        print(f"Storekit webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope is {event, data}. Two exceptions: order.refund.* put order/customer/venue/refund
    # beside `event`, and the legacy order.created sends the bare order object with no `event`
    # at all (recognised here by its order fields). Prefer order.created.v2 for new integrations.
    event_type = event.get("event")
    if event_type is None and event.get("id") and event.get("orderType") and event.get("items"):
        event_type = "order.created"
    data = as_dict(event.get("data"))
    # The body has no event id: `svix-id` is the stable message id (same on retries), use it to deduplicate.
    # Deliveries are not ordered: judge order state from the latest `status`, not from arrival order.
    print(f"Received Storekit webhook {msg_id}: {event_type}")

    if event_type in ("order.created.v2", "order.created"):
        # order.created is the same order as the top-level body
        order = event if event_type == "order.created" else data
        # `actions.accept` / `actions.reject` exist only when the store has Auto-accept off
        awaiting = "(awaiting accept/reject)" if order.get("actions") else ""
        print(f"New order: {order.get('id')} {order.get('code')} {order.get('orderType')} {order.get('total')} {awaiting}")
    elif event_type == "order.accepted":
        print(f"Order accepted: {data.get('id')} {data.get('acceptedAt')}")
    elif event_type == "order.rejected":
        print(f"Order rejected: {data.get('id')} {data.get('rejectedAt')}")
    elif event_type in ("order.canceled", "order.preparing", "order.ready_for_pickup",
                        "order.out_for_delivery", "order.completed"):
        # data = { order: { id, code, status }, venue }
        order = as_dict(data.get("order"))
        print(f"Order status: {event_type} {order.get('id')} {order.get('status')}")
    elif event_type == "order.pos.dispatch.failed":
        pos = as_dict(data.get("pos"))
        print(f"POS dispatch failed: {as_dict(data.get('order')).get('id')} {pos.get('name')} "
              f"{pos.get('error')} {data.get('retryCount')}")
    elif event_type == "order.rating.updated":
        print(f"Order rated: {as_dict(data.get('order')).get('id')} {data.get('rating')} {data.get('comments')}")
    elif event_type in ("order.refund.created", "order.refund.succeeded", "order.refund.failed"):
        # No `data` wrapper: order, customer, venue and refund sit beside `event`
        refund = as_dict(event.get("refund"))
        print(f"Order refund: {event_type} {as_dict(event.get('order')).get('id')} "
              f"{refund.get('status')} {refund.get('amount')}")
    elif event_type == "store.opened":
        print(f"Store opened: {as_dict(data.get('venue')).get('slug')}")
    elif event_type == "store.closed":
        # closedReason and closedUntil are empty strings when not set
        print(f"Store closed: {as_dict(data.get('venue')).get('slug')} {data.get('closedReason')} {data.get('closedUntil')}")
    elif event_type == "store.opening_hours.updated":
        print(f"Opening hours updated: {as_dict(data.get('venue')).get('slug')} {data.get('source')}")
    elif event_type == "item.out_of_stock":
        print(f"Item out of stock: {as_dict(data.get('item')).get('name')} {data.get('reason')} {data.get('source')}")
    elif event_type == "payments.payout.created":
        print(f"Payout created: {data.get('amounts')} {data.get('estimatedArrivalDate')}")
    elif event_type == "bill.payment.created":
        # The docs list this event but show no payload: log what arrives
        print(f"Bill payment created: {json.dumps(data)}")
    elif event_type == "payment_link.created":
        link = as_dict(data.get("paymentLink"))
        print(f"Payment link created: {link.get('id')} {link.get('amount')} {link.get('currency')}")
    elif event_type == "payment_link.paid":
        payment = as_dict(data.get("payment"))
        print(f"Payment link paid: {as_dict(data.get('paymentLink')).get('id')} {payment.get('transactionId')} "
              f"{payment.get('amount')} {payment.get('currency')}")
    elif event_type in ("payment_link.refund.created", "payment_link.refund.succeeded", "payment_link.refund.failed"):
        refund = as_dict(data.get("refund"))
        print(f"Payment link refund: {event_type} {refund.get('id')} {refund.get('amount')} {refund.get('currency')}")
    elif event_type in ("printer.status.offline", "printer.status.online"):
        print(f"Printer status: {event_type} {as_dict(data.get('printer')).get('name')} "
              f"{as_dict(data.get('venue')).get('slug')}")
    else:
        # Return 200 for events you don't handle, or Storekit keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
