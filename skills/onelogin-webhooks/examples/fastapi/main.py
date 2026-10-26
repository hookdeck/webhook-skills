# Generated with: onelogin-webhooks skill
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
    TypeError on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_onelogin_request(headers, secret=None, header_name=None) -> bool:
    """OneLogin does not sign Event Broadcaster requests. You add a custom header (any
    name, any value) to the broadcaster and compare it with the value you stored. The
    WHOLE header value is compared: a "Bearer " prefix is not stripped or parsed.
    This is a static shared credential: it authenticates the sender, not the body, and
    gives no replay protection. Use HTTPS and rotate it if it leaks.
    """
    secret = secret if secret is not None else os.environ.get("ONELOGIN_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = header_name or os.environ.get("ONELOGIN_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_onelogin_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_onelogin_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def parse_events(raw: bytes):
    """The body is a JSON array of events (the JSON Array format type OneLogin recommends; its
    docs describe no other). Returns a list of event dicts, or None if the body isn't valid."""
    try:
        text = raw.decode("utf-8").strip()
    except UnicodeDecodeError:
        return None
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    events = parsed if isinstance(parsed, list) else [parsed]
    return events if all(isinstance(e, dict) for e in events) else None


def handle_event(event: dict) -> None:
    # The broadcaster sends every event type on the account: filter by event_type_id.
    try:
        event_type_id = int(event.get("event_type_id"))
    except (TypeError, ValueError):
        event_type_id = None

    if event_type_id == 5:
        print(f"User login success: {event.get('user_name')} ({event.get('user_id')}) from {event.get('ipaddr')}")
        # TODO: check event["risk_score"] and flag risky logins

    elif event_type_id == 6:
        print(f"User login failed: {event.get('user_name') or event.get('login_name')} from {event.get('ipaddr')}")
        # TODO: count failures and alert on brute force

    elif event_type_id == 7:
        print(f"User logout: {event.get('user_name')} ({event.get('user_id')})")
        # TODO: end the matching session in your app

    elif event_type_id == 8:
        print(f"User logged into an app: {event.get('user_name')} -> {event.get('app_name')}")
        # TODO: record app access

    elif event_type_id == 11:
        print(f"User changed password: {event.get('user_name')} ({event.get('user_id')})")
        # TODO: revoke other sessions or notify the user

    elif event_type_id == 22:
        print(f"User added an MFA device: {event.get('user_name')} ({event.get('otp_device_name')})")
        # TODO: audit the new factor

    else:
        print(f"Unhandled event_type_id: {event.get('event_type_id')}")


@app.post("/webhooks/onelogin", dependencies=[Depends(require_onelogin_credential)])
async def onelogin_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    events = parse_events(await request.body())
    if events is None:
        raise HTTPException(status_code=400, detail="Expected a JSON array of events")

    try:
        for event in events:
            handle_event(event)
    except Exception as err:  # noqa: BLE001
        # Non-200 makes OneLogin retry (up to 3 attempts in total).
        print(f"Error handling OneLogin events: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # OneLogin requires HTTP 200; anything else (or a timeout) triggers a retry.
    return {"received": len(events)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
