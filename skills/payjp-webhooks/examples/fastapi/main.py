# Generated with: payjp-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Demo dedupe store. Use a shared store (Redis, database) with a TTL in production.
seen_events: set = set()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. compare_digest takes bytes (str raises on non-ASCII),
    so encode both sides and compare equal-length digests."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_payjp_request(headers, secret=None) -> bool:
    """PAY.JP does not sign payloads. Every webhook carries X-Payjp-Webhook-Token, the
    account's webhook token (whook_...). It authenticates the sender, not the body,
    and gives no replay protection: use HTTPS and rotate the token if it leaks.
    """
    secret = secret if secret is not None else os.environ.get("PAYJP_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("x-payjp-webhook-token")
    return bool(received) and safe_equal(received, secret)


async def require_payjp_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_payjp_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Payjp-Webhook-Token")


def handle_event(event: dict) -> None:
    event_type = event["type"]
    data = event["data"]

    if event_type == "charge.succeeded":
        print(f"Charge succeeded: {data.get('id')} ({data.get('amount')} {data.get('currency')})")
        # TODO: fulfil the order

    elif event_type == "charge.failed":
        print(f"Charge failed: {data.get('id')} ({data.get('failure_code')})")
        # TODO: notify the customer

    elif event_type == "charge.updated":
        print(f"Charge updated: {data.get('id')}")
        # TODO: sync metadata

    elif event_type == "charge.refunded":
        print(f"Charge refunded: {data.get('id')} ({data.get('amount_refunded')} refunded)")
        # TODO: reverse fulfilment

    elif event_type == "charge.captured":
        print(f"Charge captured: {data.get('id')}")
        # TODO: confirm the sale

    elif event_type == "dispute.created":
        print(f"Dispute created: {data.get('id')}")
        # TODO: gather evidence

    elif event_type == "customer.created":
        print(f"Customer created: {data.get('id')}")
        # TODO: sync the customer record

    elif event_type == "customer.updated":
        print(f"Customer updated: {data.get('id')}")
        # TODO: sync the customer record

    elif event_type == "customer.deleted":
        print(f"Customer deleted: {data.get('id')}")
        # TODO: remove the customer record

    elif event_type == "subscription.created":
        print(f"Subscription created: {data.get('id')}")
        # TODO: activate access

    elif event_type == "subscription.renewed":
        print(f"Subscription renewed: {data.get('id')}")
        # TODO: extend access

    elif event_type == "subscription.canceled":
        print(f"Subscription canceled: {data.get('id')}")
        # TODO: schedule revocation

    elif event_type == "transfer.succeeded":
        print(f"Transfer succeeded: {data.get('id')}")
        # TODO: reconcile the payout

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/payjp", dependencies=[Depends(require_payjp_token)])
async def payjp_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if (
        not isinstance(event, dict)
        or not isinstance(event.get("type"), str)
        or not isinstance(event.get("data"), dict)
    ):
        raise HTTPException(status_code=400, detail="Expected a PAY.JP event object")

    # PAY.JP can deliver the same event more than once: dedupe on the event id.
    event_id = event.get("id")
    if event_id and event_id in seen_events:
        return {"received": True, "duplicate": True}

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling PAY.JP event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_events.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
