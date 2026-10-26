# Generated with: doordash-drive-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest raises
    TypeError on a non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_doordash_drive_request(headers, config=os.environ) -> bool:
    """DoorDash Drive does not sign payloads. Whatever text you enter in the Developer Portal
    ("Basic Auth") is sent verbatim as the Authorization header. Compare the WHOLE header
    value; don't strip a scheme prefix and don't base64-decode it as HTTP Basic.

    A static credential authenticates the sender, not the body, and gives no replay
    protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.
    """
    expected = config.get("DOORDASH_DRIVE_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload: dict):
    """Delivery webhooks carry `event_name`. Refund webhooks have no event_name and
    nest their data under `event_data`."""
    if isinstance(payload.get("event_name"), str):
        return payload["event_name"]
    if isinstance(payload.get("event_data"), dict):
        return "refund"
    return None


async def require_doordash_drive_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_doordash_drive_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    name = classify(payload)
    delivery_id = payload.get("external_delivery_id")

    if name == "DASHER_CONFIRMED":
        print(f"Dasher {payload.get('dasher_id')} confirmed delivery {delivery_id}")
        # TODO: show the Dasher's name and vehicle to the customer

    elif name == "DASHER_CONFIRMED_PICKUP_ARRIVAL":
        print(f"Dasher arrived at pickup for {delivery_id}")

    elif name == "DASHER_PICKED_UP":
        print(f"Delivery {delivery_id} picked up at {payload.get('pickup_time_actual')}")
        # TODO: mark the order as out for delivery

    elif name == "DASHER_CONFIRMED_DROPOFF_ARRIVAL":
        print(f"Dasher arrived at dropoff for {delivery_id}")

    elif name == "DASHER_DROPPED_OFF":
        print(f"Delivery {delivery_id} dropped off at {payload.get('dropoff_time_actual')}")
        # TODO: mark the order as delivered

    elif name == "DELIVERY_CANCELLED":
        print(f"Delivery {delivery_id} cancelled: {payload.get('cancellation_reason')}")
        # TODO: cancel or re-dispatch the order

    elif name in ("DELIVERY_RETURN_INITIALIZED", "DASHER_CONFIRMED_RETURN_ARRIVAL", "DELIVERY_RETURNED"):
        print(f"Return update {name} for {delivery_id}")

    elif name == "DELIVERY_BATCHED":
        print(f"Delivery {delivery_id} batched ({payload.get('force_batch_id')})")

    elif name == "refund":
        data = payload["event_data"]
        print(f"Refund: {data.get('reason')} ({data.get('amount')} {data.get('currency_code')})")
        # TODO: record the refund

    elif name and name.startswith("dasher_enroute_to_"):
        print(f"{name} for {delivery_id}: {payload.get('dasher_location')}")
        # TODO: update the live map

    else:
        print(f"Unhandled DoorDash Drive payload {name}")


@app.post("/webhooks/doordash-drive", dependencies=[Depends(require_doordash_drive_auth)])
async def doordash_drive_webhook(request: Request):
    # Read the raw body so any content type works.
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
        print(f"Error handling DoorDash Drive webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # DoorDash retries anything other than 200 OK (3 attempts in total).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
