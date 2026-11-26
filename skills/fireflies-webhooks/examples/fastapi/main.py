# Generated with: fireflies-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="


def signing_secret() -> str | None:
    """Read the configured signing secret.

    Read per request so the secret can be changed (or unset) without reimporting
    the module - see the unsigned-delivery case in the webhook handler.
    """
    return os.environ.get("FIREFLIES_WEBHOOK_SECRET")


def verify_fireflies_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Fireflies Webhooks V2 signature.

    V2 signs the raw request body with HMAC-SHA256 keyed on the signing secret
    you configured at webhook setup, and sends the digest in the
    ``X-Hub-Signature`` header as ``sha256=<hex>``. The ``sha256=`` prefix is
    required.
    """
    # Fail closed: no header or no configured secret means we cannot verify
    if not signature_header or not secret:
        return False

    # V2 requires the "sha256=" prefix - reject anything else (including a bare
    # hex digest) rather than guessing at the format
    if not signature_header.startswith(SIGNATURE_PREFIX):
        return False

    # Compute expected signature over the raw body (hex-encoded, prefixed)
    expected_signature = SIGNATURE_PREFIX + hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature_header, expected_signature)


@app.post("/webhooks/fireflies")
async def fireflies_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature")
    secret = signing_secret()

    # The V2 signing secret is optional at webhook setup. When it is unset,
    # Fireflies sends no X-Hub-Signature header at all, so there is nothing to
    # verify. This example accepts those deliveries with a loud warning so an
    # unconfigured setup still works end to end - set a secret in production.
    if not secret:
        print(
            "WARNING: FIREFLIES_WEBHOOK_SECRET is not set - accepting this delivery "
            "UNVERIFIED. Configure a signing secret on the Fireflies Webhooks V2 "
            "page and set it here."
        )
    elif not verify_fireflies_webhook(raw_body, signature_header, secret):
        # A secret is configured, so every delivery must carry a valid signature
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    event = payload.get("event")
    meeting_id = payload.get("meeting_id")
    client_reference_id = payload.get("client_reference_id")
    timestamp = payload.get("timestamp")

    print(f'Received "{event}" event for meeting {meeting_id} (ts: {timestamp})')

    # Handle the event based on its type (Fireflies puts the type in the body)
    if event == "meeting.transcribed":
        ref = f" (ref: {client_reference_id})" if client_reference_id else ""
        print(f"Transcript ready for meeting {meeting_id}{ref}")
        # Your code: fetch the transcript from the Fireflies GraphQL API using
        # meeting_id, then sync notes, post to Slack, update your CRM, etc.
    elif event == "meeting.summarized":
        print(f"Summary ready for meeting {meeting_id}")
        # Your code: fetch the AI summary / action items and route them onward.
    elif event == "meeting.bot_joined":
        print(f"Fred bot joined meeting {meeting_id}")
        # Your code: mark the meeting as being recorded, notify participants, etc.
    else:
        print(f"Unhandled event type: {event}")

    # Return 200 to acknowledge receipt (Fireflies expects a 2xx within 30s)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
