# Generated with: cloudentity-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_cloudentity_request(headers, api_key=None) -> bool:
    """Cloudentity (SecureAuth) does not sign payloads. Every webhook request carries
    the Webhook API Key as plain text in the X-API-Key header. Compare the WHOLE header
    value with the key you stored. This authenticates the sender only; it says nothing
    about the body and gives no replay protection.
    """
    api_key = api_key if api_key is not None else os.environ.get("CLOUDENTITY_WEBHOOK_API_KEY")
    if not api_key:
        return False  # never accept when unconfigured
    received = headers.get("x-api-key")
    return bool(received) and safe_equal(received, api_key)


async def require_cloudentity_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_cloudentity_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def event_name(audit_event: dict):
    """The docs don't name a field that carries the event type. They say the webhook
    payload "delivers the matching field in subject_action form" (user_deleted), and
    the external-logging guide reads audit_events.payload.login_failed.cause, which
    suggests each audit event's `payload` object holds one key named for the event.
    That is an inference: confirm it against a real delivery before relying on it."""
    payload = audit_event.get("payload")
    if not isinstance(payload, dict) or len(payload) != 1:
        return None
    return next(iter(payload))


def handle_event(audit_event: dict) -> None:
    name = event_name(audit_event)
    event_id = audit_event.get("event_id")

    if name == "user_created":
        print(f"User created (event {event_id})")
        # TODO: create the matching record in your CRM

    elif name == "user_updated":
        print(f"User updated (event {event_id})")
        # TODO: sync profile changes

    elif name == "user_deleted":
        print(f"User deleted (event {event_id})")
        # TODO: deprovision the user downstream

    elif name == "user_authenticated":
        print(f"User authenticated (event {event_id})")
        # TODO: record the sign-in

    elif name == "group_created":
        print(f"Group created (event {event_id})")
        # TODO: mirror the group

    elif name == "login_failed":
        print(f"Login failed (event {event_id})")
        # TODO: feed your SIEM or alerting

    elif name == "consent_revoked":
        print(f"Consent revoked (event {event_id})")
        # TODO: stop processing data covered by the consent

    elif name == "client_created":
        print(f"Client created (event {event_id})")
        # TODO: audit the new application

    else:
        print(f"Unhandled event: {name}")


@app.post("/webhooks/cloudentity", dependencies=[Depends(require_cloudentity_key)])
async def cloudentity_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # SecureAuth sends audit events in batches: { "audit_events": [ ... ] }
    if not isinstance(payload, dict) or not isinstance(payload.get("audit_events"), list):
        raise HTTPException(status_code=400, detail="Expected an audit_events array")

    try:
        for audit_event in payload["audit_events"]:
            handle_event(audit_event if isinstance(audit_event, dict) else {})
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Cloudentity events: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
