# Generated with: zoop-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Event ids already processed. Use a durable store (Redis, a database unique key) in production.
seen: set = set()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes (compare_digest raises on
    non-ASCII str) and hash them so the lengths match."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_zoop_request(headers, config=os.environ) -> bool:
    """Zoop does not sign payloads. It sends back, verbatim in the Authorization header,
    the "authorization" string you set when creating the webhook. Compare the whole header
    value; don't strip or parse any prefix. A static credential authenticates the sender
    only: it gives no replay protection, so use HTTPS and rotate the value if it leaks.
    """
    expected = config.get("ZOOP_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_zoop_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_zoop_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def process_event(event: dict) -> str:
    """Dispatch on event["type"]. Returns what happened, which is handy for tests."""
    event_id = event.get("id")
    if event_id:
        if event_id in seen:
            return "duplicate"
        seen.add(event_id)

    event_type = event.get("type")
    obj = (event.get("payload") or {}).get("object") or {}
    obj_id = obj.get("id")

    if event_type == "ping":
        # Sent once when the webhook is created; a 200 activates the webhook.
        print("Zoop ping received")

    elif event_type == "transaction.succeeded":
        print(f"Transaction {obj_id} succeeded")
        # TODO: mark the order as paid and fulfil it

    elif event_type == "transaction.failed":
        print(f"Transaction {obj_id} failed")
        # TODO: notify the buyer or retry the payment

    elif event_type == "transaction.canceled":
        print(f"Transaction {obj_id} canceled")
        # TODO: release stock

    elif event_type == "seller.activated":
        print(f"Seller {obj_id} activated")
        # TODO: enable payouts for the seller

    elif event_type == "bank_account.associated":
        print(f"Bank account {obj_id} associated")
        # TODO: mark the seller's payout details as ready

    else:
        print(f"Unhandled Zoop event type: {event_type}")

    return event_type


def process_event_safely(event: dict) -> None:
    try:
        process_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Zoop webhook: {err}")


# POST only: other methods get 405.
@app.post("/webhooks/zoop", dependencies=[Depends(require_zoop_auth)])
async def zoop_webhook(request: Request, background_tasks: BackgroundTasks):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="Expected an event object with a type")

    # Zoop waits 1 second for a response and retries after 10 minutes: acknowledge first,
    # then process. Background tasks run after the response is sent; in production,
    # push the event onto a queue here instead.
    background_tasks.add_task(process_event_safely, event)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
