# Generated with: timify-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_timify_request(headers, secret=None, header_name=None) -> bool:
    """TIMIFY does not sign payloads. When "Include header name" is enabled on the webhook
    subscription, every request carries the header name and secret value you chose.
    Compare the WHOLE header value (no Bearer parsing). Starlette headers are
    case-insensitive. compare_digest gets bytes, so non-ASCII values can't raise.
    """
    secret = secret if secret is not None else os.environ.get("TIMIFY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TIMIFY_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and hmac.compare_digest(
        received.encode("utf-8"), secret.encode("utf-8")
    )


async def require_timify_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_timify_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing TIMIFY webhook header")


def normalize(value) -> str:
    """Normalize "Customer Fields" / "customer_fields" / "customerFields" to "customerfields"."""
    return re.sub(r"[^a-z0-9]", "", str(value if value is not None else "").lower())


def handle_event(payload: dict) -> None:
    """TIMIFY's overview page does not document the payload fields, so this dispatch is
    defensive: it looks for the webhook name and type under a few likely keys and
    acknowledges anything it doesn't recognise. Adjust to the payloads you actually receive.
    """
    raw_name = payload.get("webhook") or payload.get("name") or payload.get("resource")
    raw_type = payload.get("type") or payload.get("action")
    name = normalize(raw_name)
    event_type = normalize(raw_type)
    label = f"{raw_name} {raw_type}"

    if name == "customers":
        print(f"Customers {event_type}: {label}")
        # TODO: sync the customer record (payload["data"])

    elif name == "event":
        print(f"Event {event_type}: {label}")
        # TODO: create, update or cancel the booking in your system

    elif name == "events":
        print(f"Events {event_type}: {label}")
        # TODO: remove the deleted bookings

    elif name == "services":
        print(f"Services {event_type}: {label}")
        # TODO: sync the service catalogue

    elif name == "resource":
        print(f"Resource {event_type}: {label}")
        # TODO: sync staff, rooms or equipment

    elif name == "company":
        print(f"Company {event_type}: {label}")
        # TODO: sync company details

    elif name == "manager":
        print(f"Manager {event_type}: {label}")
        # TODO: sync manager accounts

    elif name == "enterprise":
        print(f"Enterprise {event_type}: {label}")
        # TODO: sync enterprise settings

    elif name == "customerfields":
        print(f"Customer Fields {event_type}: {label}")
        # TODO: sync custom customer field definitions

    elif name == "shift":
        print(f"Shift {event_type}: {label}")
        # TODO: sync working hours

    elif name == "notification":
        print(f"Notification {event_type}: {label}")
        # TODO: forward the notification

    elif name == "servicegroups":
        print(f"Service Groups {event_type}: {label}")
        # TODO: sync service groups

    else:
        print(f"Unhandled TIMIFY event: {label}")


@app.post("/webhooks/timify", dependencies=[Depends(require_timify_header)])
async def timify_webhook(request: Request):
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
        print(f"Error handling TIMIFY event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
