# Generated with: alchemy-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

alchemy_signing_key = os.environ.get("ALCHEMY_SIGNING_KEY", "")


def verify_alchemy_signature(raw_body: bytes, signature: str, signing_key: str) -> bool:
    """Verify an Alchemy Notify webhook signature.

    Alchemy signs the RAW request body with HMAC-SHA256 (hex) using the
    per-webhook signing key and sends it in the ``X-Alchemy-Signature`` header.
    There is no ``sha256=`` prefix and no timestamp.
    """
    if not signature:
        return False

    digest = hmac.new(
        signing_key.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison to prevent timing attacks
    return hmac.compare_digest(signature, digest)


@app.post("/webhooks/alchemy")
async def alchemy_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first)
    raw_body = await request.body()
    signature = request.headers.get("x-alchemy-signature")

    # Verify the signature before trusting anything in the payload
    if not verify_alchemy_signature(raw_body, signature, alchemy_signing_key):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    payload = json.loads(raw_body)
    event_type = payload.get("type")
    event = payload.get("event", {})

    print(
        f"Received {event_type} event "
        f"(id: {payload.get('id')}, webhook: {payload.get('webhookId')})"
    )

    # Dispatch on the webhook type
    if event_type == "ADDRESS_ACTIVITY":
        for activity in event.get("activity", []):
            print(
                f"Address activity on {event.get('network')}: "
                f"{activity.get('value')} {activity.get('asset')} "
                f"{activity.get('fromAddress')} -> {activity.get('toAddress')} "
                f"({activity.get('hash')})"
            )
        # TODO: credit balances, detect deposits, update accounting, etc.

    # DEPRECATED 2026-08-30: no longer documented by Alchemy and not accepted by the
    # Notify API's create-webhook endpoint. Kept so webhooks created before that date
    # keep working; don't wire new integrations to it.
    elif event_type == "MINED_TRANSACTION":
        print(f"Mined tx on {event.get('network')}: {event.get('transaction', {}).get('hash')}")
        # TODO: confirm sends, advance order status, unlock features, etc.

    # DEPRECATED 2026-08-30: see MINED_TRANSACTION above.
    elif event_type == "DROPPED_TRANSACTION":
        print(f"Dropped tx on {event.get('network')}: {event.get('transaction', {}).get('hash')}")
        # TODO: resubmit with higher gas, alert the user, roll back UI, etc.

    elif event_type == "NFT_ACTIVITY":
        for activity in event.get("activity", []):
            token_id = activity.get("erc721TokenId") or activity.get("tokenId")
            print(
                f"NFT activity on {event.get('network')}: "
                f"contract {activity.get('contractAddress')} token {token_id} "
                f"{activity.get('fromAddress')} -> {activity.get('toAddress')}"
            )
        # TODO: update marketplace feed, track ownership, mint alerts, etc.

    # DEPRECATED 2026-08-30: see MINED_TRANSACTION above.
    elif event_type == "NFT_METADATA_UPDATE":
        print(
            f"NFT metadata update on {event.get('network')}: "
            f"{event.get('contractAddress')} #{event.get('tokenId')}"
        )
        # TODO: refresh cached media/attributes, re-index the collection, etc.

    elif event_type == "GRAPHQL":
        print("Custom Webhook (GraphQL) matched:", json.dumps(event.get("data", {})))
        # TODO: handle your Custom Webhook query results

    else:
        print(f"Unhandled webhook type: {event_type}")

    # Acknowledge receipt quickly; do heavy work asynchronously
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
