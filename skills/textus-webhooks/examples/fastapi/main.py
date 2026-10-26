import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_textus_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    """Verify `X-TextUs-Signature`: bare hex HMAC-SHA256 of the raw body.

    The key is the whole webhook secret (`textus-...`) as UTF-8. There is no
    official verification SDK, so we verify manually with `hmac`.
    """
    if not secret or not header:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str (a 500).
    return hmac.compare_digest(expected.encode("utf-8"), header.lower().encode("utf-8"))


@app.post("/webhooks/textus")
async def textus_webhook(request: Request):
    # Read the raw bytes: never parse JSON before verifying.
    raw_body = await request.body()
    signature = request.headers.get("x-textus-signature")

    if not verify_textus_signature(raw_body, signature, os.getenv("TEXTUS_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is in `action`.
    action = event.get("action")

    if action == "message.received":
        print("Message received:", (event.get("message") or {}).get("id"))
        # TODO: Route the reply to your CRM or support queue.
    elif action == "message.delivered":
        print("Message delivered:", (event.get("message") or {}).get("id"))
        # TODO: Mark the outgoing message as delivered.
    elif action in ("message.failed", "message.unknown"):
        print(f"Message problem ({action}):", (event.get("message") or {}).get("id"))
        # TODO: Alert or retry through another channel.
    elif action == "phone_call.completed":
        print("Phone call completed")
        # TODO: Log the call against the contact.
    elif action == "contact.opted_out":
        print("Contact opted out:", event.get("optOut"))
        # TODO: Suppress this number in your systems.
    elif action == "contact.opted_in":
        print("Contact opted in:", event.get("optOut"))
        # TODO: Re-enable messaging for this number.
    elif action == "contact.created":
        print("Contact created:", (event.get("contact") or {}).get("id"))
        # TODO: Sync the new contact.
    else:
        print(f"Unhandled event: {action}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
