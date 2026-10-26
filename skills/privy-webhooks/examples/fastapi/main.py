# Generated with: privy-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Privy Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/privy")
async def privy_webhook(request: Request):
    secret = os.environ.get("PRIVY_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("PRIVY_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Privy (Svix) signed
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
        print(f"Privy webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `type`; the event's own fields (user, wallet_id, ...)
    # sit beside it at the top level, not under `data`
    event_type = event.get("type")
    # svix-id is stable across retries; `idempotency_key` (where present) identifies the event itself
    print(f"Received Privy webhook {msg_id}: {event_type}")

    user = event.get("user")
    user_id = user.get("id") if isinstance(user, dict) else None

    if event_type == "privy.test":
        # Sent by the dashboard's "Test webhook" button
        print(f"Test webhook: {event.get('message')}")
    elif event_type == "user.created":
        print(f"User created: {user_id}")
    elif event_type == "user.authenticated":
        print(f"User authenticated: {user_id}")
    elif event_type in ("user.linked_account", "user.unlinked_account"):
        print(f"User {event_type.split('.')[1]}: {user_id}")
    elif event_type == "user.wallet_created":
        print(f"Wallet created for user: {user_id}")
    elif event_type == "user.deleted":
        print(f"User deleted: {user_id}")
    elif event_type in ("mfa.enabled", "mfa.disabled"):
        print(f"MFA {event_type.split('.')[1]}: {user_id}")
    elif event_type in ("wallet.funds_deposited", "wallet.funds_withdrawn"):
        print(f"Wallet {event_type.split('.')[1]}: {event.get('wallet_id')}")
    elif event_type == "wallet.private_key_export":
        # Security-relevant: alert or audit-log this one
        print(f"Private key exported: {event.get('wallet_id')}")
    elif event_type in (
        "transaction.broadcasted",
        "transaction.confirmed",
        "transaction.failed",
        "transaction.execution_reverted",
    ):
        print(f"Transaction {event_type.split('.')[1]}: {event.get('transaction_hash')}")
    elif event_type in (
        "wallet_action.swap.created",
        "wallet_action.swap.succeeded",
        "wallet_action.swap.failed",
    ):
        print(f"Swap {event_type.split('.')[2]}: {event.get('wallet_id')}")
    elif event_type in ("intent.created", "intent.executed"):
        print(f"Intent {event_type.split('.')[1]}")
    elif event_type == "user_operation.completed":
        print("User operation completed")
    else:
        # Return 200 for events you don't handle, or Privy keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
