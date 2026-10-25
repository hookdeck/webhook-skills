# Generated with: cin7-core-webhooks skill
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
    """Constant-time comparison: compare_digest on equal-length SHA-256 digests (bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_cin7_core_request(headers, name=None, secret=None) -> bool:
    """Cin7 Core does not sign payloads. It sends the header configured on the webhook
    (bearerauth -> Authorization, or a custom ExternalHeaders key). Compare the WHOLE
    value exactly; do not strip or parse a 'Bearer ' prefix.
    """
    name = name or os.environ.get("CIN7_CORE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("CIN7_CORE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_cin7_core_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_cin7_core_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    event_type = payload.get("EventType")

    if event_type == "Sale/Created":
        print("Sale created")
        # TODO: sync the new sale to your system

    elif event_type == "Sale/OrderAuthorised":
        print("Sale order authorised")
        # TODO: start fulfilment

    elif event_type == "Sale/ShipmentAuthorised":
        print("Sale shipment authorised")
        # TODO: notify the customer / update tracking

    elif event_type == "Purchase/OrderAuthorised":
        print("Purchase order authorised")
        # TODO: sync the purchase to accounting

    elif event_type == "Product/Updated":
        print("Product updated")
        # TODO: refresh your catalogue

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/cin7-core", dependencies=[Depends(require_cin7_core_credential)])
async def cin7_core_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Cin7 Core event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
