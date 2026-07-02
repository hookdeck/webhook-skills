# Generated with: okta-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

OKTA_WEBHOOK_SECRET = os.environ.get("OKTA_WEBHOOK_SECRET")


def is_authorized(auth_header: str | None, secret: str | None) -> bool:
    """
    Timing-safe comparison of the Authorization header against the shared secret.
    Okta Event Hooks have no HMAC signature — auth is a static Authorization value.
    """
    if not auth_header or not secret:
        return False
    return hmac.compare_digest(auth_header, secret)


def handle_event(event: dict) -> None:
    """Dispatch on the System Log event type at data.events[].eventType."""
    event_type = event.get("eventType")
    target = event.get("target") or []
    actor = event.get("actor") or {}

    if event_type == "user.lifecycle.create":
        print("User created:", target[0].get("alternateId") if target else None)
        # TODO: provision downstream account, send welcome flow, etc.
    elif event_type == "user.session.start":
        print("User signed in:", actor.get("alternateId"))
        # TODO: audit logging, anomaly detection, etc.
    elif event_type == "user.account.lock":
        print("Account locked:", target[0].get("alternateId") if target else None)
        # TODO: security alerting, notify the user, etc.
    elif event_type == "group.user_membership.add":
        print("User added to group:", [t.get("alternateId") for t in target])
        # TODO: sync entitlements, update downstream roles, etc.
    else:
        print("Unhandled event type:", event_type)


@app.get("/webhooks/okta")
async def verify(
    x_okta_verification_challenge: str | None = Header(default=None),
):
    """
    One-time verification handshake.
    Okta sends a GET with the x-okta-verification-challenge header; echo it back.
    """
    return {"verification": x_okta_verification_challenge}


@app.post("/webhooks/okta")
async def receive(request: Request, authorization: str | None = Header(default=None)):
    """Event delivery. Okta POSTs a JSON payload with data.events[]."""
    if not is_authorized(authorization, OKTA_WEBHOOK_SECRET):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    try:
        payload = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    events = (payload or {}).get("data", {}).get("events")
    if not isinstance(events, list):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid payload: missing data.events[]"},
        )

    # A single POST may carry multiple events.
    for event in events:
        handle_event(event)

    return {"received": True}
