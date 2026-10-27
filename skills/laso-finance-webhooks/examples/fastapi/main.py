# Generated with: laso-finance-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Laso Finance Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Laso Finance sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/laso-finance")
async def laso_finance_webhook(request: Request):
    secret = os.environ.get("LASO_FINANCE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("LASO_FINANCE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Laso Finance signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Laso Finance webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The envelope is { type, timestamp, data }; data is { user_id, title, text, category }
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries and the body has no event id: use it to deduplicate
    print(f"Received Laso Finance webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "notification.account":
        print(f"Account: {data.get('title')}")
    elif event_type == "notification.transaction":
        print(f"Transaction: {data.get('title')}")
    elif event_type == "notification.deposit":
        print(f"Deposit: {data.get('title')}")
    elif event_type == "notification.withdrawal":
        print(f"Withdrawal: {data.get('title')}")
    elif event_type == "notification.card":
        print(f"Card: {data.get('title')}")
    elif event_type == "notification.giftCard":
        print(f"Gift card: {data.get('title')}")
    elif event_type == "notification.refund":
        print(f"Refund: {data.get('title')}")
    elif event_type == "notification.balanceUpdate":
        print(f"Balance update: {data.get('title')}")
    else:
        # The category list is open-ended ("Categories include ..."): ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
