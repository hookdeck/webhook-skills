import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()

# Event IDs already handled. Use a database or Redis in production.
processed_events = set()


def verify_asaas_token(received_token: Optional[str], expected_token: Optional[str]) -> bool:
    """Asaas does not sign payloads. It sends the authToken you configured, unchanged,
    in the asaas-access-token header. Compare it in constant time."""
    if not received_token or not expected_token:
        return False
    # Hash both sides so compare_digest always gets equal-length values.
    return hmac.compare_digest(
        hashlib.sha256(received_token.encode()).digest(),
        hashlib.sha256(expected_token.encode()).digest(),
    )


@app.post("/webhooks/asaas")
async def asaas_webhook(
    request: Request,
    # FastAPI maps the underscores to hyphens: asaas-access-token
    asaas_access_token: Optional[str] = Header(default=None),
):
    expected_token = os.environ.get("ASAAS_WEBHOOK_TOKEN")
    if not expected_token:
        print("ASAAS_WEBHOOK_TOKEN is not set")
        return PlainTextResponse("Webhook token not configured", status_code=500)

    if not verify_asaas_token(asaas_access_token, expected_token):
        return PlainTextResponse("Invalid asaas-access-token", status_code=401)

    # Read the raw body; parse JSON only after the token check passes.
    raw_body = await request.body()
    try:
        body = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    if not isinstance(body, dict) or not isinstance(body.get("event"), str):
        return PlainTextResponse("Missing event", status_code=400)

    # Delivery is at-least-once: skip events whose id we have already processed.
    event_id = body.get("id")
    if event_id and event_id in processed_events:
        return JSONResponse({"received": True, "duplicate": True})
    if event_id:
        processed_events.add(event_id)

    event = body["event"]
    payment = body.get("payment") or {}

    if event == "PAYMENT_CREATED":
        print(f"Charge created: {payment.get('id')}")
    elif event == "PAYMENT_CONFIRMED":
        print(f"Payment confirmed (balance not yet available): {payment.get('id')}")
    elif event == "PAYMENT_RECEIVED":
        print(f"Payment received: {payment.get('id')} ({payment.get('value')})")
    elif event == "PAYMENT_OVERDUE":
        print(f"Charge overdue: {payment.get('id')}")
    elif event == "PAYMENT_REFUNDED":
        print(f"Charge refunded: {payment.get('id')}")
    elif event == "SUBSCRIPTION_CREATED":
        print(f"Subscription created: {(body.get('subscription') or {}).get('id')}")
    elif event == "TRANSFER_DONE":
        print(f"Transfer done: {(body.get('transfer') or {}).get('id')}")
    else:
        print(f"Unhandled event: {event}")

    # Persist first, respond 200 quickly, and do slow work asynchronously.
    return JSONResponse({"received": True})
