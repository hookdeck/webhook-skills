# Generated with: tokity-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="
# Standard padded base64 of a 32-byte digest: 43 characters plus one "=".
BASE64_SHA256 = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_tokity_signature(raw_body: bytes, signature_header, secret=None) -> bool:
    """Tokity signs the raw request body with HMAC-SHA256, keyed with the webhook's secret
    (its UTF-8 bytes, used as-is), and sends "sha256=" + standard base64 in `x-dd-signature`.
    Nothing else is signed: no timestamp and no id.

    The bare digest (no "sha256=") is accepted too. The value is checked against the exact
    44-character base64 form first, then the base64 values are compared as bytes in constant
    time. The signature is never decoded: a decoder would also accept a non-canonical last
    character that decodes to the same bytes, which Tokity's own check rejects.
    """
    if secret is None:
        secret = os.environ.get("TOKITY_WEBHOOK_SECRET")
    if not secret or not isinstance(signature_header, str):
        return False

    received = signature_header.removeprefix(SIGNATURE_PREFIX)
    if not BASE64_SHA256.fullmatch(received):
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    return hmac.compare_digest(received.encode("ascii"), expected)


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: read the exact bytes and reject the request before parsing."""
    raw_body = await request.body()
    if not verify_tokity_signature(raw_body, request.headers.get("x-dd-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing x-dd-signature")
    return raw_body


def classify(item: dict) -> str:
    """Tokity payloads carry no event name. A chat webhook item is a chat session
    (status plus pastStatus). Anything else is a ticket: a webhook item is the ticket plus
    `from` (its previous state, null on creation); an Events action sends the ticket
    without `from`.
    """
    if isinstance(item.get("status"), str) and isinstance(item.get("pastStatus"), list):
        return "chat"
    return "ticket_change"


def text(value) -> str:
    return str(value) if isinstance(value, (str, int)) and not isinstance(value, bool) else "unknown"


def handle_chat(chat: dict) -> None:
    past = [s for s in (chat.get("pastStatus") or []) if isinstance(s, str)]
    ref = chat.get("reference")
    print(f"Chat session {text(chat.get('id'))} is {text(chat.get('status'))} (past: {', '.join(past) or 'none'})")
    if isinstance(ref, dict) and ref.get("type") == "ticket":
        print(f"  about ticket {text(ref.get('id'))}")
    # TODO: notify technicians, or follow up on 'missed' / 'callback' sessions


def handle_ticket(ticket: dict) -> None:
    ticket_id = text(ticket.get("id"))
    previous = ticket.get("from")
    if "from" in ticket and previous is None:
        print(f"Ticket {ticket_id} created")
        # TODO: act on the new ticket
    elif isinstance(previous, dict):
        changed = [
            key
            for key in ticket
            if key != "from" and json.dumps(ticket[key], sort_keys=True) != json.dumps(previous.get(key), sort_keys=True)
        ]
        print(f"Ticket {ticket_id} changed: {', '.join(changed) or 'no fields'}")
        # TODO: act on the fields that changed
    else:
        print(f"Ticket {ticket_id} event (no previous state, sent by a Tokity Events action)")


def handle_item(item: dict) -> None:
    if classify(item) == "chat":
        handle_chat(item)
    else:
        handle_ticket(item)


@app.post("/webhooks/tokity")
async def tokity_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse only after the signature check. Treat everything in the body as untrusted.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Chat webhooks send an array; ticket webhooks may too. Accept one object or a list.
    items = payload if isinstance(payload, list) else [payload]
    if not all(isinstance(item, dict) for item in items):
        raise HTTPException(status_code=400, detail="Expected a JSON object or an array of objects")

    try:
        for item in items:
            handle_item(item)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Tokity webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
