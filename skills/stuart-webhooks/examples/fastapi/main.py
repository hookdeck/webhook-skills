# Generated with: stuart-webhooks skill
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
    """Constant-time comparison: encode to bytes (compare_digest raises on non-ASCII str)
    and compare equal-length digests."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_stuart_request(headers, name=None, secret=None) -> bool:
    """Stuart does not sign payloads. You choose a "Webhook authentication header" (name
    starts with X-) and key; Stuart adds that header to every webhook. The value is compared
    whole: no 'Bearer ' parsing. A static credential authenticates the sender, not the body,
    and gives no replay protection: use HTTPS and rotate it if it leaks.
    """
    name = name or os.environ.get("STUART_WEBHOOK_HEADER") or "X-Webhook-Secret"
    secret = secret if secret is not None else os.environ.get("STUART_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name.lower())  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_stuart_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_stuart_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing authentication header")


def handle_event(payload: dict) -> None:
    topic = payload.get("topic")
    details = payload.get("details") or {}
    package = details.get("package") or {}
    ref = f"{package.get('id')} ({package.get('reference')})"

    if topic == "package_created":
        print(f"Package created: {ref}")
        # TODO: store details["package"]["id"] next to your order

    elif topic == "courier_assigned":
        print(f"Courier assigned to {ref}: {(details.get('courier') or {}).get('name')}")
        # TODO: show the courier name and tracking URLs

    elif topic == "courier_arriving":
        print(f"Courier arriving at {details.get('task')} for {ref}")
        # TODO: tell the store (pickup) or customer (dropoff)

    elif topic == "package_split":
        print(f"Package {ref} split into {(details.get('new_package') or {}).get('id')}")
        # TODO: track the new package

    elif topic == "courier_waiting":
        print(f"Courier waiting at {details.get('task')} for {ref}")
        # TODO: nudge the store or customer

    elif topic == "package_delivering":
        print(f"Package delivering: {ref}")
        # TODO: mark the order out for delivery

    elif topic == "package_delivered":
        print(f"Package delivered: {ref}")
        # TODO: close the order

    elif topic == "package_canceled":
        print(f"Package canceled: {ref} ({(details.get('cancelation') or {}).get('key')})")
        # TODO: refund or reship

    elif topic == "package_returning":
        print(f"Package returning: {ref} ({(details.get('return') or {}).get('key')})")
        # TODO: flag the failed delivery

    elif topic == "package_returned":
        print(f"Package returned: {ref}")
        # TODO: restock

    elif topic == "courier_reassigning":
        print(f"Courier reassigning: {ref} ({(details.get('reassigning') or {}).get('key')})")
        # TODO: reset the ETA

    elif topic == "courier_moving":
        print(f"Courier moving for {ref}")
        # TODO: update the live map from details["coordinates"]

    else:
        print(f"Unhandled topic: {topic}")


@app.post("/webhooks/stuart", dependencies=[Depends(require_stuart_header)])
async def stuart_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        # TODO: deduplicate on payload["event_id"] (unique except on retries)
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Stuart event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
