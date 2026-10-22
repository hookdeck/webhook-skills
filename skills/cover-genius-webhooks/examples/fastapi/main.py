# Generated with: cover-genius-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_cover_genius_request(headers, api_key=None) -> bool:
    """Cover Genius Offers webhooks carry no payload signature. They send your
    authentication key as plain text in the X-Api-Key header (no prefix)."""
    if api_key is None:
        api_key = os.environ.get("COVER_GENIUS_API_KEY")
    if not api_key:
        return False  # never accept when unconfigured
    received = headers.get("x-api-key")
    return received is not None and safe_equal(received, api_key)


async def require_cover_genius_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_cover_genius_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Key")


def handle_event(body: dict) -> None:
    event = body.get("event")
    payload = body.get("payload") or {}

    if event == "BOOKING_CREATED":
        print(f"Booking created: {payload.get('id')} ({payload.get('total_price_formatted')})")
        # TODO: send the customer confirmation

    elif event == "BOOKING_UPDATED":
        print(f"Booking updated: {payload.get('id')}")
        # TODO: sync the updated policy details

    elif event == "BOOKING_CANCELLED":
        print(f"Booking cancelled: {payload.get('id')}")
        # TODO: process the refund / cancel fulfilment

    elif event == "RENEWAL_CREATED":
        print(f"Renewal created: {payload.get('id')} (package {payload.get('package_id')})")
        # TODO: record the renewed policy

    elif event == "RENEWAL_NOTIFICATION":
        print(f"Renewal approaching: {payload.get('id')}, due {payload.get('due_date')}")
        # TODO: remind the customer

    elif event == "RENEWAL_DUE":
        print(f"Renewal due: {payload.get('id')}, grace period ends {payload.get('expiry_date')}")
        # TODO: prompt the customer to pay

    elif event == "RENEWAL_EXPIRED":
        print(f"Renewal expired: {payload.get('id')}")
        # TODO: mark the policy as lapsed

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/cover-genius", dependencies=[Depends(require_cover_genius_key)])
async def cover_genius_webhook(request: Request):
    # Any content type is accepted: authentication runs first, then the raw body is parsed.
    raw_body = await request.body()

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Cover Genius event: {err}")
        # Anything other than 200 makes Cover Genius retry (up to 3 times).
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
