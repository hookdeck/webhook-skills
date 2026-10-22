# Generated with: youcanbookme-webhooks skill
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
    """Constant-time comparison on bytes (compare_digest raises TypeError on non-ASCII str)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_youcanbookme_request(headers, secret=None, header_name=None) -> bool:
    """YouCanBookMe does not sign payloads. You add a secret Request Header (name and value of
    your choosing) to the webhook action; compare the WHOLE header value. Starlette headers are
    case-insensitive. A static credential authenticates the sender, not the body, and gives no
    replay protection.
    """
    secret = secret if secret is not None else os.environ.get("YOUCANBOOKME_WEBHOOK_SECRET")
    header_name = (
        header_name or os.environ.get("YOUCANBOOKME_WEBHOOK_HEADER") or "Authorization"
    )
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_youcanbookme_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_youcanbookme_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def handle_event(payload: dict) -> None:
    # The body is the owner's template, so `event` is whatever the template names.
    event = payload.get("event")
    email = payload.get("email")

    if event == "booking_made":
        print(f"Booking made: {email}")
        # TODO: create the CRM contact or calendar entry

    elif event == "booking_rescheduled":
        print(f"Booking rescheduled: {email}")
        # TODO: move the matching record

    elif event == "booking_cancelled":
        print(f"Booking cancelled: {email}")
        # TODO: cancel downstream work

    elif event == "reminder":
        print(f"Reminder: {email}")
        # TODO: send a nudge

    elif event == "follow_up":
        print(f"Follow-up: {email}")
        # TODO: trigger a survey or thank-you

    elif event == "no_show":
        print(f"No-show: {email}")
        # TODO: flag the contact

    else:
        print(f"Unhandled event: {event}")


# The method is user-chosen in YouCanBookMe, so accept all of these.
@app.api_route(
    "/webhooks/youcanbookme",
    methods=["POST", "PUT", "PATCH", "DELETE", "GET"],
    dependencies=[Depends(require_youcanbookme_header)],
)
async def youcanbookme_webhook(request: Request):
    # Read the raw body so any content type is accepted; an empty body (e.g. GET) is valid.
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling YouCanBookMe event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
