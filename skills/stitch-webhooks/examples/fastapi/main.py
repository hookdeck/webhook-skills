# Generated with: stitch-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Stitch Webhook Handler")


def get_event_type(event: dict) -> str:
    """Return the Stitch event type for either payload shape.

    payment-consent-request, transaction and collection carry a top-level
    `type`. payment, payment.confirmation, refund and disbursement are
    GraphQL-shaped ({"data": {"client": {<key>: {"node": ...}}}}) with no
    `type`, so derive it from the key under data.client.
    """
    if isinstance(event.get("type"), str):
        return event["type"]
    client = (event.get("data") or {}).get("client") or {}
    if "paymentInitiationRequests" in client:
        return "payment"  # also payment.confirmation (same shape)
    if "refunds" in client:
        return "refund"
    if "disbursements" in client:
        return "disbursement"
    return "unknown"


def _node(event: dict, key: str) -> dict:
    return (((event.get("data") or {}).get("client") or {}).get(key) or {}).get("node") or {}


def _typename(value: Optional[dict]) -> Optional[str]:
    return (value or {}).get("__typename")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/stitch")
async def stitch_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("STITCH_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("STITCH_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify against the RAW body, never a re-serialized payload.
    body = await request.body()
    try:
        # HMAC-SHA256 over f"{svix_id}.{svix_timestamp}.{body}", compared against
        # every v1 entry in svix-signature, plus a 5-minute timestamp tolerance.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Stitch webhook verification failed: {err}")
        detail = "Invalid timestamp" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    # Verified: now it is safe to parse.
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = get_event_type(event)
    data = event.get("data") or {}
    print(f"Received Stitch webhook {svix_id}: {event_type}")

    # Process idempotently: Svix may deliver the same message more than once.
    if event_type == "payment":
        node = _node(event, "paymentInitiationRequests")
        print(
            "Payment request update:",
            node.get("id"),
            node.get("externalReference"),
            _typename(node.get("state")),
            _typename(node.get("paymentConfirmation")),
        )
        # TODO: update the order from state / paymentConfirmation
    elif event_type == "payment-consent-request":
        print(f"Consent update: {data.get('id')} {data.get('status')}")
        # TODO: store/revoke the consent (card token, DebiCheck mandate, ...)
    elif event_type == "transaction":
        print(f"Transaction update: {data.get('id')} {data.get('status')}")
        # TODO: mark the recurring charge SUCCESS / FAILURE / CANCELLED
    elif event_type == "collection":
        print(f"Collection update: {data.get('id')} {data.get('status')}")
        # TODO: reconcile the batch collection
    elif event_type == "refund":
        node = _node(event, "refunds")
        print(f"Refund update: {node.get('id')} {_typename(node.get('status'))}")
        # TODO: update refund status
    elif event_type == "disbursement":
        node = _node(event, "disbursements")
        print(f"Disbursement update: {node.get('id')} {_typename(node.get('status'))}")
        # TODO: update payout status
    else:
        print(f"Unhandled Stitch event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
