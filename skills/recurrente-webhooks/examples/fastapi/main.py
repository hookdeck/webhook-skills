# Generated with: recurrente-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Recurrente Webhook Handler")

SUBSCRIPTION_EVENTS = {
    "subscription.create",
    "subscription.past_due",
    "subscription.pause",
    "subscription.unpause",
    "subscription.reactivate",
    "subscription.update",
    "subscription.item_added",
    "subscription.item_removed",
    "subscription.invoice_item_added",
    "subscription.cancel",
}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/recurrente")
async def recurrente_webhook(request: Request):
    secret = os.environ.get("RECURRENTE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("RECURRENTE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Recurrente (Svix) signed
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
        print(f"Recurrente webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `event_type`. In the unified intent.* payload the
    # top-level `type` is the payment method (payment, bank_transfer, crypto, balance, cash)
    event_type = event.get("event_type")
    # The delivery id (svix-id) is stable across retries: use it to deduplicate
    print(f"Received Recurrente webhook {msg_id}: {event_type}")

    details = event.get("details") if isinstance(event.get("details"), dict) else {}

    if event_type == "intent.succeeded":
        # Funds are already in your balance
        print(f"Payment succeeded: {event.get('id')} {event.get('type')} {event.get('amount_in_cents')} {event.get('currency')}")
    elif event_type == "intent.pending":
        # Started but not settled (bank transfer, crypto)
        print(f"Payment pending: {event.get('id')} {event.get('type')}")
    elif event_type == "intent.failed":
        print(f"Payment failed: {event.get('id')} {details.get('failure_reason')}")
    elif event_type == "intent.canceled":  # one "l", unlike setup_intent.cancelled
        print(f"Payment canceled: {event.get('id')}")
    elif event_type == "intent.paid":
        # Balance payments only: sent to the paying account (the one whose balance was debited)
        print(f"Balance payment paid: {event.get('id')} {event.get('amount_in_cents')} {event.get('currency')}")
    elif event_type in SUBSCRIPTION_EVENTS:
        # Subscription events have their own flat payloads: check the event catalog for the shape
        print(f"Subscription event: {event_type}")
    elif event_type in ("setup_intent.succeeded", "setup_intent.cancelled"):  # two "l"s in cancelled
        print(f"Setup intent event: {event_type}")
    elif event_type == "refund.create":
        print("Refund processed")
    elif event_type in ("dispute.create", "dispute.update"):
        print(f"Chargeback event: {event_type}")
    elif event_type == "verification.completed":
        # Connected accounts: the platform receives these with connected: true and the child account_id
        print(f"Account verification accepted: {event.get('account_id')}")
    elif event_type == "verification.rejected":
        print(f"Account verification rejected: {event.get('account_id')} {event.get('document_errors')}")
    elif event_type == "tax_invoice_settings.enabled":
        print(f"FEL tax invoicing enabled: {event.get('account_id')} {event.get('tax_invoicing')}")
    elif event_type == "account_connection.create":
        print("Connected account linked to the platform")
    elif event_type in ("transfer.sent", "transfer.received"):
        print(f"P2P transfer event: {event_type}")
    elif event_type in ("withdrawal.create", "withdrawal.update"):
        # Read the status from the payload: "sent" is terminal success for local withdrawals
        withdrawal = event.get("withdrawal") if isinstance(event.get("withdrawal"), dict) else {}
        transfer = event.get("transfer") if isinstance(event.get("transfer"), dict) else {}
        print(f"Withdrawal event: {event_type} {withdrawal.get('status') or transfer.get('status')}")
    else:
        # Return 200 for events you don't handle, or Recurrente keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
