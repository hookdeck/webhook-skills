# Generated with: layerswap-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Layerswap Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/layerswap")
async def layerswap_webhook(request: Request):
    secret = os.environ.get("LAYERSWAP_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("LAYERSWAP_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Layerswap (Svix) signed
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
        print(f"Layerswap webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body is {swap, quote, deposit_actions} with no event-type field:
    # the swap's lifecycle state is `swap.status`.
    swap = event.get("swap") if isinstance(event.get("swap"), dict) else {}
    quote = event.get("quote") if isinstance(event.get("quote"), dict) else {}
    metadata = swap.get("metadata") if isinstance(swap.get("metadata"), dict) else {}
    swap_status = swap.get("status")
    swap_id = swap.get("id")
    # No retry schedule or ordering is documented: deduplicate on swap.id + status
    # and fetch GET /swaps/{id} before any irreversible action.
    print(f"Received Layerswap webhook for swap {swap_id}: {swap_status}")

    if swap_status == "user_transfer_pending":
        # Swap created; waiting for the user's deposit (expires after 6 hours without one)
        print(f"Awaiting deposit: {swap_id} {event.get('deposit_actions')}")
    elif swap_status == "ls_transfer_pending":
        # Deposit confirmed; Layerswap is executing the swap. Not final: it can retry for a while
        print(f"Swap executing: {swap_id}")
    elif swap_status == "completed":
        # Funds delivered to the destination address: safe to fulfil after reconciling with GET /swaps/{id}
        print(f"Swap completed: {swap_id} {metadata.get('reference_id')} {quote.get('receive_amount')}")
    elif swap_status == "failed":
        print(f"Swap failed: {swap_id} {swap.get('fail_reason')}")
    elif swap_status == "expired":
        print(f"Swap expired (no deposit within 6 hours): {swap_id}")
    elif swap_status == "pending_refund":
        print(f"Refund pending: {swap_id} {swap.get('fail_reason')}")
    elif swap_status == "refunded":
        print(f"Swap refunded: {swap_id}")
    else:
        # Return 200 for statuses you don't handle, or Svix keeps retrying them
        print(f"Unhandled swap status: {swap_status}")

    return {"success": True, "status": swap_status}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
