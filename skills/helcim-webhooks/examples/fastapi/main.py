# Generated with: helcim-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Helcim Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Helcim sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/helcim")
async def helcim_webhook(request: Request):
    # The verifierToken exactly as Helcim shows it (bare base64). The library also accepts a whsec_ prefix.
    secret = os.environ.get("HELCIM_WEBHOOK_SECRET")
    if not secret:
        print("HELCIM_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Helcim signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" (key = base64-decoded verifierToken)
        # against every v1, signature and enforces a fixed 5-minute timestamp window
        # (see references/verification.md to change that).
        # A malformed signature entry or token raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Helcim webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `type`. cardTransaction is thin: {id, type}.
    # terminalCancel is {data, type}. webhook-id is stable across retries: use it to deduplicate.
    event_type = event.get("type")
    print(f"Received Helcim webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "cardTransaction":
        # Only the card transaction ID is sent: fetch the rest with Get Card Transaction by ID
        print(f"Card transaction: {event.get('id')}")
    elif event_type == "terminalCancel":
        data = event.get("data") if isinstance(event.get("data"), dict) else {}
        print(f"Terminal cancel: {data.get('deviceCode')} {data.get('transactionAmount')} {data.get('currency')}")
    else:
        # Helcim's documented list may grow: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
