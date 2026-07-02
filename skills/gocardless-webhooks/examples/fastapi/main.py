"""GoCardless webhook handler with FastAPI.

GoCardless only ships a Node.js SDK for webhook parsing, so in Python we verify the
signature manually. The algorithm is simple and stable: HMAC-SHA256 (hex) over the
RAW request body, keyed with the webhook endpoint secret, compared timing-safely
against the `Webhook-Signature` header.
"""

import hashlib
import hmac
import json
import os

from fastapi import FastAPI, Request, Response

app = FastAPI()

WEBHOOK_SECRET = os.getenv("GOCARDLESS_WEBHOOK_SECRET", "")


def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify the GoCardless Webhook-Signature header.

    Recomputes HMAC-SHA256 (hex) over the raw body and compares it to the header
    using a timing-safe comparison.
    """
    if not signature_header or not secret:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,  # raw bytes exactly as received, NOT re-serialized JSON
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


@app.post("/webhooks/gocardless")
async def handle_webhook(request: Request):
    # Read the RAW body BEFORE parsing JSON — required for signature verification.
    raw_body = await request.body()
    signature = request.headers.get("Webhook-Signature", "")

    if not verify_signature(raw_body, signature, WEBHOOK_SECRET):
        # Any non-2xx makes GoCardless retry; 498 is the documented "invalid token".
        return Response(content="Invalid signature", status_code=498)

    payload = json.loads(raw_body)
    events = payload.get("events", [])

    # A webhook is a BATCH of events (up to 250). GoCardless retries the whole batch
    # on any non-2xx, so handlers must be idempotent on event["id"].
    for event in events:
        handle_event(event)

    # Acknowledge the batch with 204 No Content.
    return Response(status_code=204)


def handle_event(event: dict) -> None:
    """Dispatch a single event by resource_type + action."""
    resource_type = event.get("resource_type")
    action = event.get("action")
    links = event.get("links") or {}
    details = event.get("details") or {}
    print(f"Event {event.get('id')}: {resource_type}.{action}")

    if resource_type == "payments":
        if action == "confirmed":
            print(f"Payment {links.get('payment')} confirmed")
            # TODO: mark the payment as collected, fulfil the order, etc.
        elif action == "paid_out":
            print(f"Payment {links.get('payment')} paid out")
        elif action == "failed":
            print(f"Payment {links.get('payment')} failed:", details.get("description"))
        elif action == "cancelled":
            print(f"Payment {links.get('payment')} cancelled")
        elif action == "charged_back":
            print(f"Payment {links.get('payment')} charged back")
        else:
            print(f"Unhandled payments action: {action}")

    elif resource_type == "mandates":
        if action == "active":
            print(f"Mandate {links.get('mandate')} is active")
        elif action == "cancelled":
            print(f"Mandate {links.get('mandate')} cancelled:", details.get("description"))
            # TODO: suspend the customer's subscription/membership, etc.
        elif action == "failed":
            print(f"Mandate {links.get('mandate')} failed")
        elif action == "expired":
            print(f"Mandate {links.get('mandate')} expired")
        else:
            print(f"Unhandled mandates action: {action}")

    elif resource_type == "payouts":
        if action == "paid":
            print(f"Payout {links.get('payout')} paid")
            # TODO: reconcile the payout against collected payments.
        elif action == "bounced":
            print(f"Payout {links.get('payout')} bounced")
        else:
            print(f"Unhandled payouts action: {action}")

    elif resource_type == "refunds":
        if action == "paid":
            print(f"Refund {links.get('refund')} paid")
        elif action == "failed":
            print(f"Refund {links.get('refund')} failed")
        else:
            print(f"Unhandled refunds action: {action}")

    elif resource_type == "subscriptions":
        if action == "created":
            print(f"Subscription {links.get('subscription')} created")
        elif action == "cancelled":
            print(f"Subscription {links.get('subscription')} cancelled")
        else:
            print(f"Unhandled subscriptions action: {action}")

    else:
        print(f"Unhandled resource_type: {resource_type}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
