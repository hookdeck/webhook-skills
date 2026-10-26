# Generated with: emarsys-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
import re
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Scheme is case-insensitive; the credentials token must use the strict base64 alphabet.
_BASIC_RE = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)


def parse_basic_auth(header: Optional[str]) -> Optional[Tuple[bytes, bytes]]:
    """Parse "Authorization: Basic base64(username:password)" into (username, password) bytes.

    Decodes strictly (validate=True), so valid credentials followed by junk are rejected,
    and splits on the FIRST colon (the password may contain colons).
    """
    if not header:
        return None
    match = _BASIC_RE.fullmatch(header)
    if not match:
        return None
    token = match.group(1)
    try:
        decoded = base64.b64decode(token, validate=True)
    except (binascii.Error, ValueError):
        return None
    # Older Pythons ignore stray padding even with validate=True, so require the canonical encoding.
    if base64.b64encode(decoded).decode() != token:
        return None
    username, sep, password = decoded.partition(b":")
    if not sep:
        return None
    return username, password


def verify_emarsys_request(headers, username=None, password=None) -> bool:
    """SAP Emarsys does not sign Webhook node calls. The sender authenticates with HTTP Basic
    auth (a static shared credential), so this proves who sent the request, not that the body
    is untampered, and it gives no replay protection.
    """
    username = username if username is not None else os.environ.get("EMARSYS_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("EMARSYS_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    credentials = parse_basic_auth(headers.get("authorization"))
    if credentials is None:
        return False
    # compare_digest on bytes (a str with non-ASCII characters would raise). Evaluate both
    # comparisons before deciding (no short-circuit).
    user_ok = hmac.compare_digest(credentials[0], username.encode("utf-8"))
    pass_ok = hmac.compare_digest(credentials[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_emarsys_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_emarsys_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


# Demo only: use a durable store (database, Redis) in production.
seen_deduplication_ids: set = set()


def handle_payload(payload: dict) -> None:
    """The body is whatever the Webhook node preset defines, so this payload is ILLUSTRATIVE:
    contact field values and "Additional data" at the top level, optional event_data with the
    triggering event's attributes, and operational fields (deduplication_id, ems_program_id,
    event_time) that can be renamed in the preset.
    """
    event_data = payload.get("event_data")
    program_id = payload.get("ems_program_id")
    event_time = payload.get("event_time")

    if isinstance(event_data, dict):
        print(f"Webhook node call with event_data (program {program_id}, at {event_time})")
        # TODO: act on the triggering event's attributes in payload["event_data"]
    else:
        print(f"Webhook node contact payload (program {program_id}, at {event_time})")
        # TODO: act on the contact field values and Additional data at the top level


@app.post("/webhooks/emarsys", dependencies=[Depends(require_emarsys_auth)])
async def emarsys_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    # 406 tells Emarsys to discard this contact and keep the program running. Any other
    # failure is retried (30 s growing to 10 min) and the program enters Fail-safe mode
    # after the 11th failure, so use 406 for bodies that can never be processed.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=406, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=406, detail="Expected a JSON object")

    # Idempotency: deduplication_id (when present) identifies a delivery.
    dedup_id = payload.get("deduplication_id")
    if dedup_id is not None and str(dedup_id) in seen_deduplication_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_payload(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Emarsys webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if dedup_id is not None:
        seen_deduplication_ids.add(str(dedup_id))
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
