# Generated with: ventrata-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

EVENT_PATTERN = re.compile(r"^(order|booking|availability|product)[._](update|updated)$")


def verify_ventrata_request(headers, secret=None, header_name=None) -> bool:
    """Ventrata does not sign payloads. You add a secret header in the webhook's headers
    map when you create it through the OCTO API. The header name is yours, so it comes
    from VENTRATA_WEBHOOK_HEADER; the expected value is the exact, whole header value
    (including any "Bearer " prefix). This authenticates the sender, not the body, and
    gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("VENTRATA_WEBHOOK_SECRET", "")
    header_name = header_name or os.environ.get("VENTRATA_WEBHOOK_HEADER") or "X-Webhook-Secret"
    received = headers.get(header_name)  # starlette headers are case-insensitive
    if not secret or not received:
        return False  # never accept when unconfigured or missing
    # compare_digest on bytes: a str containing non-ASCII characters raises TypeError
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


def normalize_event(event):
    """The capability lists booking_update; the API examples write booking.updated."""
    m = EVENT_PATTERN.match(str(event or ""))
    return f"{m.group(1)}_update" if m else event


async def require_ventrata_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_ventrata_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    event = normalize_event(payload.get("event"))

    if event == "order_update":
        print(f"Order updated: {(payload.get('order') or {}).get('orderId')}")
        # TODO: sync payload["order"]; payload["diff"] lists what changed

    elif event == "booking_update":
        print(f"Booking updated: {(payload.get('booking') or {}).get('uuid')}")
        # TODO: sync payload["booking"]; payload["diff"] lists what changed

    elif event == "availability_update":
        print(f"Availability updated: {(payload.get('availability') or {}).get('id')}")
        # TODO: refresh inventory from payload["availability"]

    elif event == "product_update":
        print(f"Product updated: {(payload.get('product') or {}).get('id')}")
        # TODO: re-sync payload["product"]; payload["diff"] lists what changed

    else:
        print(f"Unhandled event: {payload.get('event')}")


@app.post("/webhooks/ventrata", dependencies=[Depends(require_ventrata_secret)])
async def ventrata_webhook(request: Request):
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
        print(f"Error handling Ventrata event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
