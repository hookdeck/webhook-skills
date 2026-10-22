# Generated with: rudderstack-webhooks skill
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

_BASIC_RE = re.compile(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def parse_basic_auth(header):
    """Parse `Authorization: Basic base64(username:password)`. The scheme is
    case-insensitive and the credentials are split on the FIRST colon, so the
    password may contain colons."""
    if not header:
        return None
    match = _BASIC_RE.match(header)
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    username, sep, password = decoded.partition(":")
    if not sep:
        return None
    return username, password


def verify_rudderstack_request(headers, config=os.environ) -> bool:
    """RudderStack does not sign payloads. The HTTP Webhook destination sends the
    Basic Auth credentials you configured. Both values are compared (no
    short-circuit) before deciding."""
    expected_user = config.get("RUDDERSTACK_WEBHOOK_USERNAME")
    expected_pass = config.get("RUDDERSTACK_WEBHOOK_PASSWORD")
    if not expected_user or not expected_pass:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    user_ok = safe_equal(creds[0], expected_user)
    pass_ok = safe_equal(creds[1], expected_pass)
    return user_ok and pass_ok


async def require_rudderstack_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_rudderstack_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="rudderstack"'},
        )


def handle_event(event: dict) -> None:
    kind = event.get("type")

    if kind == "track":
        print(f"Track: {event.get('event')} (user {event.get('userId') or event.get('anonymousId')})")
        # TODO: handle the tracked event (event["event"], event["properties"])

    elif kind == "identify":
        print(f"Identify: user {event.get('userId') or event.get('anonymousId')}")
        # TODO: sync event["traits"] to your user store

    elif kind == "page":
        print(f"Page: {event.get('name') or (event.get('properties') or {}).get('url')}")
        # TODO: record the page view

    elif kind == "screen":
        print(f"Screen: {event.get('name')}")
        # TODO: record the screen view

    elif kind == "group":
        print(f"Group: {event.get('groupId')}")
        # TODO: sync event["traits"] to your account/group store

    elif kind == "alias":
        print(f"Alias: {event.get('previousId')} -> {event.get('userId')}")
        # TODO: merge the two identities

    else:
        # Mappings can emit any shape, and warehouse sources send other message types.
        print(f"Unhandled RudderStack payload (type: {kind})")


# The HTTP method is chosen in the destination settings, so accept all of them.
@app.api_route(
    "/webhooks/rudderstack",
    methods=["POST", "PUT", "PATCH", "GET", "DELETE"],
    dependencies=[Depends(require_rudderstack_auth)],
)
async def rudderstack_webhook(request: Request):
    # Read the raw body so any content type works. An empty body (e.g. GET) is valid.
    raw_body = await request.body()
    events = []

    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        # Batching sends a JSON array of events.
        events = payload if isinstance(payload, list) else [payload]
        if not all(isinstance(e, dict) for e in events):
            raise HTTPException(
                status_code=400, detail="Expected a JSON object or an array of objects"
            )

    try:
        for event in events:
            handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling RudderStack event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "events": len(events)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
