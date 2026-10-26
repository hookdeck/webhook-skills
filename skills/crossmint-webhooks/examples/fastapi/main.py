# Generated with: crossmint-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Crossmint Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Crossmint sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names."""
    prefix = "svix" if headers.get("svix-id") else "webhook"
    return (
        headers.get(f"{prefix}-id"),
        headers.get(f"{prefix}-timestamp"),
        headers.get(f"{prefix}-signature"),
    )


@app.post("/webhooks/crossmint")
async def crossmint_webhook(request: Request):
    secret = os.environ.get("CROSSMINT_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("CROSSMINT_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id, timestamp, signature = read_signature_headers(request.headers)
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Crossmint (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
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
    except WebhookVerificationError as err:
        print(f"Crossmint webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Every product puts the event name in the top-level `type`. The envelope around it differs:
    # wallets/offramp use `id`, checkout V3 and minting use `actionId`. The svix-id is stable across retries.
    event_type: Optional[str] = payload.get("type") if isinstance(payload.get("type"), str) else None
    print(f"Received Crossmint webhook {msg_id}: {event_type} ({payload.get('id') or payload.get('actionId')})")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}

    if event_type in ("wallets.transfer.in", "wallets.transfer.out"):
        # transfer.out is sent for failed transfers too: check data.status and data.error
        token = data.get("token") or {}
        print(f"{event_type}: {data.get('status')} {token.get('symbol')} {token.get('amount')}")
    elif event_type == "wallets.signer.exported":
        print(f"Wallet signer exported: {data}")
    elif event_type == "purchase.succeeded":
        # Checkout V2: flat body, no `data`
        print(f"Purchase succeeded: {payload.get('txId')} {payload.get('walletAddress')}")
    elif event_type in ("orders.quote.created", "orders.quote.updated"):
        print(f"{event_type}: {data.get('orderId')} {data.get('phase')}")
    elif event_type == "orders.payment.succeeded":
        print(f"Order payment succeeded: {data.get('orderId')}")
    elif event_type == "orders.payment.failed":
        print(f"Order payment failed: {data.get('orderId')}")
    elif event_type == "orders.delivery.initiated":
        print(f"Order delivery initiated: {data.get('orderId')}")
    elif event_type == "orders.delivery.completed":
        print(f"Order delivery completed: {data.get('orderId')}")
    elif event_type == "orders.delivery.failed":
        print(f"Order delivery failed: {data.get('orderId')}")
    elif event_type in (
        "collections.create.succeeded",
        "collections.update.succeeded",
        "nfts.create.succeeded",
        "nfts.update.succeeded",
    ):
        print(f"{event_type}: {payload.get('actionId')} {data}")
    elif event_type == "nfts.create.failed":
        print(f"NFT mint failed: {payload.get('actionId')} {data}")
    elif event_type == "credential.creation.succeeded":
        print(f"Credential created: {data}")
    elif event_type == "credential.creation.failed":
        print(f"Credential creation failed: {data.get('error', data)}")
    elif event_type == "payment_methods.status.updated":
        # Offramp events may arrive out of order: compare timestamps before overwriting state
        print(f"Payment method status updated: {payload.get('id')} {payload.get('timestamp')} {data}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
