# Generated with: doubleword-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI()


def create_webhook(secret: str) -> Webhook:
    """A whsec_ secret is base64-decoded after the prefix (the library does
    this for str). Any other secret is used as its raw UTF-8 bytes, matching
    Hookdeck, which the library accepts as bytes."""
    return Webhook(secret if secret.startswith("whsec_") else secret.encode("utf-8"))


def standard_headers(request: Request) -> dict:
    """Doubleword sends webhook-* headers; fall back to svix-* when webhook-id
    is absent, then hand the library the names it reads."""
    prefix = "webhook" if request.headers.get("webhook-id") else "svix"
    return {
        "webhook-id": request.headers.get(f"{prefix}-id", ""),
        "webhook-timestamp": request.headers.get(f"{prefix}-timestamp", ""),
        "webhook-signature": request.headers.get(f"{prefix}-signature", ""),
    }


@app.post("/webhooks/doubleword")
async def doubleword_webhook(request: Request):
    secret = os.getenv("DOUBLEWORD_WEBHOOK_SECRET")
    if not secret:
        # Fail closed: never accept unverified deliveries.
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: the signature covers the exact body.
    raw_body = await request.body()

    headers = standard_headers(request)
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    try:
        # verify() also enforces a fixed 5-minute timestamp window.
        # The library can raise plain ValueError/binascii.Error on malformed
        # signature entries, so catch broadly.
        create_webhook(secret).verify(raw_body.decode("utf-8"), headers, json_parse=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after the signature check.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    data = event.get("data") or {}
    event_type = event.get("type")

    if event_type == "batch.completed":
        print(f"Batch {data.get('batch_id')} completed: {data.get('request_counts')}")
        # TODO: download results with the files API using data["output_file_id"]
    elif event_type == "batch.failed":
        print(f"Batch {data.get('batch_id')} failed: {data.get('request_counts')}")
        # TODO: alert, then inspect data["error_file_id"]
    else:
        print(f"Unhandled event type: {event_type}")

    # Any 2xx acknowledges. Repeated non-2xx responses disable the webhook.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
