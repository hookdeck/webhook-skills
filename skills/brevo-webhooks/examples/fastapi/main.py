# Generated with: brevo-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import os
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, Header, HTTPException

load_dotenv()

app = FastAPI(title="Brevo Webhook Handler")


def verify_brevo_auth(
    authorization: Optional[str],
    username: Optional[str] = None,
    password: Optional[str] = None,
    token: Optional[str] = None,
) -> bool:
    """
    Authenticate a Brevo webhook request.

    Brevo does NOT sign webhook payloads (no HMAC/signature header). Instead the
    webhook is created with one of:
      - Basic auth: credentials in the notify URL (https://user:pass@host/...),
        which Brevo sends as `Authorization: Basic base64(user:pass)`
      - Bearer token: `"auth": {"type": "bearer", "token": "..."}` on the
        webhook, sent as `Authorization: Bearer <token>`
    Either configured method is accepted; credentials are compared timing-safe.
    """
    if not authorization:
        return False

    if token and authorization.startswith("Bearer "):
        return hmac.compare_digest(authorization[7:].encode(), token.encode())

    if username and password and authorization.startswith("Basic "):
        try:
            decoded = base64.b64decode(authorization[6:], validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return False
        if ":" not in decoded:
            return False
        # Split on the FIRST colon; passwords may contain ':'
        user, _, pw = decoded.partition(":")
        # Evaluate both comparisons so timing doesn't reveal which one failed
        user_ok = hmac.compare_digest(user.encode(), username.encode())
        pass_ok = hmac.compare_digest(pw.encode(), password.encode())
        return user_ok and pass_ok

    return False


def require_brevo_auth(authorization: Optional[str] = Header(None)) -> None:
    """FastAPI dependency that authenticates the Brevo webhook request."""
    username = os.getenv("BREVO_WEBHOOK_USERNAME")
    password = os.getenv("BREVO_WEBHOOK_PASSWORD")
    token = os.getenv("BREVO_WEBHOOK_TOKEN")

    # Fail closed: without a configured credential there is nothing to check.
    if not (username and password) and not token:
        print("Set BREVO_WEBHOOK_USERNAME/PASSWORD or BREVO_WEBHOOK_TOKEN")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    if not verify_brevo_auth(authorization, username, password, token):
        print("Brevo webhook authentication failed")
        raise HTTPException(status_code=401, detail="Unauthorized")


def handle_brevo_event(event: Dict[str, Any]) -> None:
    # `event` is the payload value (snake_case), not the camelCase name you
    # subscribe with (e.g. subscribe to `hardBounce`, receive `hard_bounce`).
    event_type = event.get("event")
    email = event.get("email")

    if event_type == "request":  # "Sent" (transactional)
        print(f"Sent to {email} ({event.get('message-id')})")
    elif event_type == "delivered":
        print(f"Delivered to {email}")
        # TODO: Mark message as delivered
    elif event_type in ("opened", "unique_opened", "proxy_open", "unique_proxy_open"):
        print(f"{event_type} by {email}")
        # TODO: Track engagement (proxy_open = opened via a privacy proxy, e.g. Apple MPP)
    elif event_type == "click":
        print(f"Click by {email}: {event.get('link') or event.get('URL')}")
    elif event_type in ("hard_bounce", "invalid_email", "blocked"):
        print(f"{event_type} for {email}: {event.get('reason', '')}")
        # TODO: Suppress the address
    elif event_type in ("soft_bounce", "deferred", "error"):
        print(f"{event_type} for {email}: {event.get('reason', '')}")
    elif event_type == "spam":
        print(f"Spam complaint from {email}")
        # TODO: Unsubscribe / suppress the address
    elif event_type in ("unsubscribed", "unsubscribe"):  # transactional / marketing
        print(f"Unsubscribed: {email}")
        # TODO: Update subscription preferences
    elif event_type in ("list_addition", "contact_updated", "contact_deleted"):
        print(f"Contact event {event_type}: {email}")
        # TODO: Sync contact to your system
    else:
        print(f"Unhandled Brevo event: {event_type or event.get('msg_status') or 'unknown'}")


@app.post("/webhooks/brevo", dependencies=[Depends(require_brevo_auth)])
async def handle_brevo_webhook(
    payload: Union[List[Dict[str, Any]], Dict[str, Any]] = Body(...),
):
    """Receive Brevo webhook events (no body signature, so JSON parsing is fine)."""
    # Batched webhooks (`batched: true`) deliver an array; normal ones a single object
    events = payload if isinstance(payload, list) else [payload]

    for event in events:
        handle_brevo_event(event)

    # Respond 2xx quickly; Brevo may retry on 5xx responses
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
