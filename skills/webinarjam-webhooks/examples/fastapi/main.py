# Generated with: webinarjam-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os

import hmac

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_webinarjam_request(headers, config=os.environ) -> bool:
    """WebinarJam does not sign requests. The only authentication is the header you add on
    the Custom Webhook integration: the Bearer token option sends `Authorization: Bearer <token>`,
    the Custom header option sends the name and value you chose. The header name comes from
    WEBINARJAM_WEBHOOK_HEADER (default Authorization) and the WHOLE value (including any
    "Bearer " prefix) is compared with WEBINARJAM_WEBHOOK_SECRET. Don't strip the prefix.
    """
    expected = config.get("WEBINARJAM_WEBHOOK_SECRET")
    if not expected:
        return False  # never accept when unconfigured
    name = config.get("WEBINARJAM_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    return safe_equal(received, expected)


async def require_webinarjam_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not os.environ.get("WEBINARJAM_WEBHOOK_SECRET"):
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")
    if not verify_webinarjam_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    # WebinarJam documents no event field: add `event` as a custom body key-value pair
    # (or use a different URL path per automation rule) to tell triggers apart.
    event = payload.get("event")
    email = payload.get("email")

    if event == "registered":
        print(f"Registered: {email}")
        # TODO: add the lead to your CRM and send the live room link

    elif event == "attended_live":
        print(f"Attended live: {email}")
        # TODO: tag the lead as an attendee

    elif event == "missed_live":
        print(f"Missed live: {email}")
        # TODO: send the replay link

    elif event == "left_early":
        print(f"Left early: {email}")
        # TODO: follow up with the replay

    elif event == "purchased":
        print(f"Purchased: {email}")
        # TODO: mark the lead as a customer

    else:
        print(f'Unhandled WebinarJam trigger "{event}": {email}')


@app.post("/webhooks/webinarjam", dependencies=[Depends(require_webinarjam_auth)])
async def webinarjam_webhook(request: Request):
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
        print(f"Error handling WebinarJam webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
