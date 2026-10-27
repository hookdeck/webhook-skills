# Generated with: blindpay-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="BlindPay Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/blindpay")
async def blindpay_webhook(request: Request):
    secret = os.environ.get("BLINDPAY_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("BLINDPAY_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes BlindPay (Svix) signed
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
        print(f"BlindPay webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Flat body: `webhook_event` first, then the resource's own fields (no wrapper object)
    name = event.get("webhook_event")
    resource_id = event.get("id")
    # svix-id is stable across retries and replays: deduplicate on it (or on the resource id + event)
    print(f"Received BlindPay webhook {name} ({msg_id}) for {resource_id}")

    if name in ("customer.new", "customer.update"):  # update includes KYC status changes
        print(f"Customer: {name} {resource_id} {event.get('kyc_status')}")
    elif name == "customer.delete":
        print(f"Customer deleted: {resource_id}")
    elif name == "bankAccount.new":
        print(f"Bank account added: {resource_id}")
    elif name in ("blockchainWallet.new", "blockchainWallet.update"):
        print(f"Blockchain wallet: {name} {resource_id}")
    elif name == "tos.accept":
        print(f"Terms of service accepted: {resource_id}")
    elif name in ("payin.new", "payin.update"):
        print(f"Payin in progress: {name} {resource_id} {event.get('status')}")
    elif name == "payin.complete":
        # Sent to the destination wallet, refunded, or failed: branch on `status`
        print(f"Payin finished: {resource_id} {event.get('status')} {event.get('receiver_amount')}")
    elif name in ("payout.new", "payout.update"):  # update also fires for a payout that reached `failed`
        print(f"Payout in progress: {name} {resource_id} {event.get('status')}")
    elif name == "payout.complete":
        print(f"Payout finished: {resource_id} {event.get('status')}")
    elif name in ("virtualAccount.new", "virtualAccount.complete"):
        print(f"Virtual account: {name} {resource_id}")
    elif name in ("transfer.new", "transfer.update", "transfer.complete"):
        print(f"Transfer: {name} {resource_id} {event.get('status')}")
    elif name in ("wallet.new", "wallet.update"):
        print(f"Managed wallet: {name} {resource_id}")
    elif name == "wallet.inbound":
        print(f"Stablecoin deposit detected: {resource_id}")
    elif name in ("limitIncrease.new", "limitIncrease.update"):
        print(f"Limit increase: {name} {resource_id} {event.get('status')}")
    elif name in ("payable.new", "payable.update", "payable.complete"):
        print(f"Payable: {name} {resource_id} {event.get('status')}")
    else:
        # The documented list may not be exhaustive: return 200 for events you don't handle
        print(f"Unhandled BlindPay event: {name}")

    return {"success": True, "event": name}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
