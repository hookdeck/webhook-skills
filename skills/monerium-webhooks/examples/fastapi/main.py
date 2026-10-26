# Generated with: monerium-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Monerium Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Monerium sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/monerium")
async def monerium_webhook(request: Request):
    secret = os.environ.get("MONERIUM_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("MONERIUM_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Monerium signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Monerium webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Every body is { type, data }: the event name is the dotted top-level `type`
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries: use it to deduplicate
    print(f"Received Monerium webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "order.created":
        # Incoming payment detected (kind "issue") before it is processed
        print(f"Order created: {data.get('id')} {data.get('kind')} {data.get('amount')} {data.get('currency')} {data.get('chain')}")
    elif event_type == "order.updated":
        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        if data.get("state") == "processed":
            # meta.txHashes holds the on-chain transaction hashes
            print(f"Order processed: {data.get('id')} {meta.get('txHashes')}")
        elif data.get("state") == "rejected":
            # meta.rejectedReason explains why
            print(f"Order rejected: {data.get('id')} {meta.get('rejectedReason')}")
        else:
            print(f"Order updated: {data.get('id')} {data.get('state')}")
    elif event_type == "subscription.created":
        # Sent right after you register the webhook: answering 200 activates the subscription
        print("Subscription created: webhook activated")
    else:
        # The documented list may not be exhaustive: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
