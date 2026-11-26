# Generated with: bridge-api-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

bridge_secret = os.environ.get("BRIDGE_WEBHOOK_SECRET")


def verify_bridge_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Bridge API webhook signature.

    Bridge signs the RAW body with HMAC-SHA256 (key = signing secret) and sends
    the digest in the ``BridgeApi-Signature`` header as one or more
    comma-separated, scheme-prefixed values: ``v1=<UPPERCASE_HEX>,v1=...``.

    - Only the ``v1`` scheme is trusted (ignore others -> prevents downgrade attacks).
    - Multiple ``v1`` values can appear during a secret rotation (old secret
      valid 24h). Accept the delivery if ANY ``v1`` value matches.
    """
    if not signature_header:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Keep only v1= signatures and strip the scheme prefix
    signatures = [
        part.strip()[3:]
        for part in signature_header.split(",")
        if part.strip().startswith("v1=")
    ]
    if not signatures:
        return False

    # Bridge sends UPPERCASE hex; lowercase both sides for a clean constant-time compare
    return any(hmac.compare_digest(sig.lower(), expected.lower()) for sig in signatures)


@app.post("/webhooks/bridge-api")
async def bridge_webhook(request: Request):
    # Read the raw body for signature verification (do NOT parse first)
    raw_body = await request.body()
    signature_header = request.headers.get("bridgeapi-signature")

    # Verify the webhook signature BEFORE parsing the body
    if not verify_bridge_webhook(raw_body, signature_header, bridge_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    event = json.loads(raw_body)
    event_type = event.get("type")
    content = event.get("content", {})

    print(f"Received {event_type} event")

    # Dispatch on the event `type` field (there is no event header).
    # Expect webhooks for already-deleted users/items -> handle defensively.
    if event_type == "TEST_EVENT":
        print("Test event received from the Bridge dashboard")

    elif event_type == "item.created":
        print(f"Item created: {content.get('item_id')}")

    elif event_type == "item.refreshed":
        print(f"Item refreshed: {content.get('item_id')} (status_code {content.get('status_code')})")

    elif event_type == "item.account.created":
        print(f"Account created under item {content.get('item_id')}")

    elif event_type == "item.account.updated":
        print(f"Account updated under item {content.get('item_id')}")

    elif event_type == "item.account.deleted":
        print(f"Account deleted under item {content.get('item_id')}")

    elif event_type == "payment.transaction.created":
        print("Payment transaction created")

    elif event_type == "payment.transaction.updated":
        print("Payment transaction updated")

    elif event_type == "payment.link.updated":
        print("Payment link updated")

    elif event_type == "user.deleted":
        print(f"User deleted: {content.get('user_uuid')}")

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge quickly with a small body (<10 KB)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
