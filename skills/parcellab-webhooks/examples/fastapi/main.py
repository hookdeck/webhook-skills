# Generated with: parcellab-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

CLOUDEVENT_TYPE_PREFIX = "com.parcellab.tracking.event."
EVENTS = [
    "onCreated",
    "onUpdated",
    "onDispatch",
    "onScheduled",
    "onDelay",
    "onInternalDelay",
    "onOutForDelivery",
    "onFailedAttempt",
    "onPickupReady",
    "onDelivered",
    "onReturn",
]
EVENTS_BY_LOWERCASE = {name.lower(): name for name in EVENTS}

BASIC_RE = re.compile(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)


def verify_parcellab_request(headers, config=os.environ) -> bool:
    """parcelLab does not sign payloads. It sends the HTTP Basic credentials you gave it:
    `Authorization: Basic base64(username:password)`. Split on the FIRST colon (the
    password may contain colons), then compare username and password each in constant
    time. Both comparisons run before the decision, so there is no short-circuit.
    """
    username = config.get("PARCELLAB_WEBHOOK_USERNAME")
    password = config.get("PARCELLAB_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured

    match = BASIC_RE.match(headers.get("authorization") or "")
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False

    received_user, sep, received_password = decoded.partition(b":")
    if not sep:
        return False

    # compare_digest needs bytes here: str raises TypeError on non-ASCII input.
    username_ok = hmac.compare_digest(received_user, username.encode("utf-8"))
    password_ok = hmac.compare_digest(received_password, password.encode("utf-8"))
    return username_ok and password_ok


def get_event_name(payload: dict):
    """Native payloads carry `event` (for example onDelivered). In CloudEvents format the
    `type` is com.parcellab.tracking.event.<lowercased event>, e.g. ...event.ondelivered."""
    event = payload.get("event")
    if isinstance(event, str):
        return event
    type_ = payload.get("type")
    if isinstance(type_, str) and type_.startswith(CLOUDEVENT_TYPE_PREFIX):
        lowercased = type_[len(CLOUDEVENT_TYPE_PREFIX):].lower()
        # Accept the lowercased event name with or without the `on` prefix.
        return EVENTS_BY_LOWERCASE.get(lowercased) or EVENTS_BY_LOWERCASE.get(f"on{lowercased}")
    return None


async def require_parcellab_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_parcellab_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def handle_event(payload: dict) -> None:
    event = get_event_name(payload)
    # Native: references at the top level. CloudEvents: nested in `data`.
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    references = payload.get("references") or data.get("references") or {}
    tracking = references.get("tracking_number")

    if event in ("onCreated", "onUpdated"):
        print(f"Record {'created' if event == 'onCreated' else 'updated'} for {tracking}")
        # TODO: sync the order/tracking record

    elif event == "onDispatch":
        print(f"Shipment {tracking} dispatched")
        # TODO: mark the order as shipped

    elif event == "onScheduled":
        print(f"Delivery scheduled for {tracking}")
        # TODO: store the announced delivery date or time window

    elif event == "onOutForDelivery":
        print(f"Shipment {tracking} is out for delivery")

    elif event in ("onDelay", "onInternalDelay", "onFailedAttempt"):
        print(f"Delivery problem ({event}) for {tracking}")
        # TODO: alert support or notify the customer

    elif event == "onPickupReady":
        print(f"Shipment {tracking} is ready for pickup")

    elif event == "onDelivered":
        print(f"Shipment {tracking} delivered")
        # TODO: mark the order as delivered

    elif event == "onReturn":
        print(f"Shipment {tracking} is being returned to the sender")
        # TODO: start your returns flow

    else:
        print(f"Unhandled parcelLab event: {event or '(none)'}")


@app.post("/webhooks/parcellab", dependencies=[Depends(require_parcellab_auth)])
async def parcellab_webhook(request: Request):
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
        print(f"Error handling parcelLab webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
