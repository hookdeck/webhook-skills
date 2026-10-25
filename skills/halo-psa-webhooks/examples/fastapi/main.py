# Generated with: halo-psa-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Strict base64: only the standard alphabet, padding only at the end.
BASE64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. compare_digest takes bytes (a str with non-ASCII
    characters raises TypeError), so encode both sides."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def parse_basic_auth(header: Optional[str]) -> Optional[tuple[str, str]]:
    """Parse `Authorization: Basic base64(username:password)`. The scheme is
    case-insensitive. Anything that isn't strictly valid (junk after the credentials,
    characters outside the base64 alphabet, bad padding, invalid UTF-8, no colon)
    returns None. Splits on the FIRST colon, so the password may contain colons."""
    if not isinstance(header, str):
        return None
    match = re.match(r"^basic +(\S+)$", header, re.IGNORECASE)
    if not match:
        return None
    encoded = match.group(1)
    if len(encoded) % 4 != 0 or not BASE64_RE.match(encoded):
        return None
    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    if ":" not in decoded:
        return None
    username, password = decoded.split(":", 1)
    return username, password


def verify_halo_psa_request(headers, config=os.environ) -> bool:
    """HaloPSA webhooks are not signed. With "Basic Authentication" chosen on the
    webhook, every request carries `Authorization: Basic base64(username:password)`.
    The credentials must arrive on the first request: Hookdeck never answers with a
    401 + WWW-Authenticate challenge."""
    username = config.get("HALO_PSA_WEBHOOK_USERNAME")
    password = config.get("HALO_PSA_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured

    credentials = parse_basic_auth(headers.get("authorization"))
    if credentials is None:
        return False

    # Evaluate both comparisons before deciding (no short-circuit on the username).
    username_ok = safe_equal(credentials[0], username)
    password_ok = safe_equal(credentials[1], password)
    return username_ok and password_ok


async def require_halo_psa_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_halo_psa_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def pick(payload: dict, *names: str):
    """Halo's docs don't name the event-name or object-id properties in text, so these
    field names are illustrative: check a real delivery in Halo's Deliveries tab or Hookdeck."""
    for name in names:
        if name in payload:
            return payload[name]
    return None


def handle_event(payload: dict) -> None:
    event = pick(payload, "event", "eventName", "event_name")
    object_id = pick(payload, "object_id", "objectId")

    if event == "New Ticket Logged":
        print(f"New ticket logged: {object_id}")
        # TODO: create the ticket in your system

    elif event == "Ticket Reassigned":
        print(f"Ticket reassigned: {object_id}")
        # TODO: notify the new assignee

    elif event in ("Document deleted on a Ticket", "Document edited on a Ticket"):
        print(f"{event}: {object_id}")
        # TODO: refresh the ticket's attachments

    else:
        print(f"Unhandled event: {event} (object: {object_id})")


@app.post("/webhooks/halo-psa", dependencies=[Depends(require_halo_psa_auth)])
async def halo_psa_webhook(request: Request):
    raw_body = await request.body()  # any content type

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # With batching enabled Halo sends a JSON array of objects instead of one object.
    events = payload if isinstance(payload, list) else [payload]
    if not all(isinstance(e, dict) for e in events):
        raise HTTPException(status_code=400, detail="Expected a JSON object or an array of objects")

    try:
        for event in events:
            handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling HaloPSA event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
