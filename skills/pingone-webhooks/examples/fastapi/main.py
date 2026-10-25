# Generated with: pingone-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises TypeError on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_pingone_request(headers, config=os.environ) -> bool:
    """PingOne does not sign subscription webhooks. It sends the headers you set on the
    subscription (httpEndpoint.headers). Compare the WHOLE header value with the expected
    one: no Bearer/Basic parsing, because the value is whatever the admin typed.
    Starlette's headers mapping is case-insensitive; a plain dict is handled too.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    secret = config.get("PINGONE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = (config.get("PINGONE_WEBHOOK_HEADER") or "Authorization").lower()
    received = next((v for k, v in headers.items() if k.lower() == header_name), None)
    if not received:
        return False
    return safe_equal(received, secret)


def parse_events(raw: bytes) -> list:
    """ACTIVITY format bodies arrive as a JSON array (JSON_ARRAY, up to 500 events) or as
    newline-delimited JSON (ND_JSON, one event per line). Returns a list of events."""
    text = raw.decode("utf-8").strip()
    if not text:
        raise ValueError("Empty body")
    try:
        parsed = json.loads(text)  # JSON_ARRAY, or ND_JSON with a single line
    except json.JSONDecodeError:
        parsed = [json.loads(line) for line in text.splitlines() if line.strip()]  # ND_JSON
    events = parsed if isinstance(parsed, list) else [parsed]
    if not all(isinstance(e, dict) for e in events):
        raise ValueError("Expected audit event objects")
    return events


async def require_pingone_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_pingone_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def handle_event(event: dict) -> None:
    """Each audit event has an `action.type` such as USER.CREATED. PingOne defines many more
    (see the Audit Reporting Events reference); subscribe only to the ones you handle."""
    event_type = (event.get("action") or {}).get("type")
    actor = ((event.get("actors") or {}).get("user") or {}).get("name")
    event_id = event.get("id")

    if event_type == "USER.CREATED":
        print(f"User created (event {event_id})")
        # TODO: provision the user in your system

    elif event_type == "USER.UPDATED":
        print(f"User updated (event {event_id})")
        # TODO: sync the changed attributes

    elif event_type == "USER.DELETED":
        print(f"User deleted (event {event_id})")
        # TODO: deprovision the user

    elif event_type == "AUTHENTICATION.CREATED":
        print(f"Authentication recorded for {actor or 'unknown actor'} (event {event_id})")
        # TODO: record the sign-in

    elif event_type == "PASSWORD.RESET":
        print(f"Password reset (event {event_id})")
        # TODO: notify the user

    else:
        print(f"Unhandled event: {event_type} (id: {event_id})")


@app.post("/webhooks/pingone", dependencies=[Depends(require_pingone_auth)])
async def pingone_webhook(request: Request):
    # Read the raw body so any content type works (JSON_ARRAY and ND_JSON).
    raw_body = await request.body()

    try:
        events = parse_events(raw_body)
    except (ValueError, UnicodeDecodeError):  # JSONDecodeError is a ValueError
        raise HTTPException(
            status_code=400, detail="Invalid body: expected a JSON array or ND_JSON of events"
        )

    try:
        for event in events:
            handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling PingOne event: {err}")
        # PingOne retries the same events until it gets a 200.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": len(events)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
