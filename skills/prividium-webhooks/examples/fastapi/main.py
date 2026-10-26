# Generated with: prividium-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Prividium Webhook Handler")

# webhook-id is stable across retries. This in-memory set is for illustration only:
# persist ids in durable storage before applying side effects in production.
processed_ids: set[str] = set()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Prividium sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def read_secrets():
    """PRIVIDIUM_WEBHOOK_SECRET is the full whsec_ value. During a key rotation you may list the
    old and new keys separated by commas; a delivery passes if any one of them verifies it."""
    secrets = [s.strip() for s in os.environ.get("PRIVIDIUM_WEBHOOK_SECRET", "").split(",") if s.strip()]
    if secrets and all(s.startswith("whsec_") for s in secrets):
        return secrets
    return None


@app.post("/webhooks/prividium")
async def prividium_webhook(request: Request):
    secrets = read_secrets()
    if not secrets:
        print("PRIVIDIUM_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Prividium signed
    raw_body = await request.body()

    # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
    # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
    last_error = None
    verified = False
    for secret in secrets:
        try:
            Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
            verified = True
            break
        except Exception as err:
            last_error = err
    if not verified:
        print(f"Prividium webhook verification failed: {last_error}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    webhook_id = sig_headers["webhook-id"]
    if webhook_id in processed_ids:
        return {"received": True, "duplicate": True}

    # The body format is not printed in Prividium's docs, so parse it only after verification
    # and don't reject a body that isn't JSON.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        payload = None
        print(f"Prividium webhook {webhook_id}: body is not JSON ({len(raw_body)} bytes)")

    # One webhook is one subscription (an event webhook = contract + topic0, an address webhook = addresses),
    # so the route or the webhook's name tells you what it watches. Add your own handling here.
    print(f"Received Prividium webhook {webhook_id}", payload if payload is not None else "")

    processed_ids.add(webhook_id)
    return {"received": True, "duplicate": False}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
