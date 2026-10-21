# Generated with: unipile-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Unipile webhook receiver.

Unipile webhooks are NOT signed. There is no signature header, HMAC or timestamp.
When you create a webhook (POST /api/v1/webhooks or the dashboard) you can add a
"headers" array, e.g. ``{"key": "Unipile-Auth", "value": "<secret>"}``. Unipile sends
those headers on every delivery, so a secret there authenticates the sender; compare
it in constant time.

Payload shapes depend on the webhook ``source``: messaging, email, email_tracking and
users send a flat object with an ``event`` field; account_status sends
``{"AccountStatus": {"account_id", "account_type", "message"}}``.
"""

import hmac
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("unipile-webhooks")
logging.basicConfig(level=logging.INFO)

DEFAULT_HEADER = "Unipile-Auth"

MESSAGE_RECEIVED = "message_received"
MESSAGE_READ = "message_read"
MAIL_RECEIVED = "mail_received"
MAIL_SENT = "mail_sent"
MAIL_MOVED = "mail_moved"
MAIL_OPENED = "mail_opened"
MAIL_LINK_CLICKED = "mail_link_clicked"
NEW_RELATION = "new_relation"

app = FastAPI()


def verify_unipile_secret(header_value: str | None) -> bool:
    """Compare the shared secret from the custom header in constant time.

    Raises RuntimeError when UNIPILE_WEBHOOK_SECRET is unset (fail closed).
    """
    expected = os.environ.get("UNIPILE_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("UNIPILE_WEBHOOK_SECRET is not set")
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())


async def require_unipile_secret(request: Request) -> None:
    """Dependency: check the shared-secret header before the body is read."""
    header_name = os.environ.get("UNIPILE_WEBHOOK_HEADER") or DEFAULT_HEADER
    try:
        # Starlette headers are case-insensitive.
        ok = verify_unipile_secret(request.headers.get(header_name))
    except RuntimeError as err:
        logger.error("Unipile webhook misconfigured: %s", err)
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not ok:
        logger.error("Unipile webhook rejected: %s missing or wrong", header_name)
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


def dedupe_key(payload: dict[str, Any]) -> str | None:
    """Unipile has no delivery ID header and retries up to 5 times, so dedupe on body fields."""
    status = payload.get("AccountStatus")
    if isinstance(status, dict):
        return f"account_status:{status.get('account_id')}:{status.get('message')}"
    event = payload.get("event")
    if event in (MAIL_OPENED, MAIL_LINK_CLICKED):
        return f"{event}:{payload['event_id']}" if payload.get("event_id") else None
    if event in (MAIL_RECEIVED, MAIL_SENT, MAIL_MOVED):
        return f"{event}:{payload['email_id']}" if payload.get("email_id") else None
    return f"{event}:{payload['message_id']}" if payload.get("message_id") else None


async def handle_message_received(payload: dict[str, Any]) -> None:
    # Sent messages also arrive as message_received: compare account_info.user_id
    # with sender.attendee_provider_id to spot your own.
    sender = payload.get("sender") or {}
    own = (payload.get("account_info") or {}).get("user_id") == sender.get("attendee_provider_id")
    logger.info(
        "Message %s in chat %s (%s) from %s%s",
        payload.get("message_id"),
        payload.get("chat_id"),
        payload.get("account_type"),
        sender.get("attendee_name", "unknown"),
        " [sent by connected account]" if own and sender.get("attendee_provider_id") else "",
    )
    # TODO: store or forward the message. Attachment urls are att:// references.


async def handle_message_read(payload: dict[str, Any]) -> None:
    logger.info("Message %s read in chat %s", payload.get("message_id"), payload.get("chat_id"))


async def handle_mail_received(payload: dict[str, Any]) -> None:
    sender = payload.get("from_attendee") or {}
    logger.info(
        "Email %s %r from %s",
        payload.get("email_id"),
        payload.get("subject", ""),
        sender.get("identifier", "unknown"),
    )


async def handle_account_status(status: dict[str, Any]) -> None:
    logger.info(
        "Account %s (%s) status: %s",
        status.get("account_id"),
        status.get("account_type"),
        status.get("message"),
    )
    if status.get("message") != "OK":
        # Not OK (e.g. CREDENTIALS) means no more new-message webhooks for this
        # account until it is reconnected. TODO: alert the user and reconnect.
        pass


async def dispatch(payload: dict[str, Any]) -> bool:
    """Dispatch on the payload shape. Returns whether it was recognised."""
    status = payload.get("AccountStatus")
    if isinstance(status, dict):
        await handle_account_status(status)
        return True
    event = payload.get("event")
    if event == MESSAGE_RECEIVED:
        await handle_message_received(payload)
        return True
    if event == MESSAGE_READ:
        await handle_message_read(payload)
        return True
    if event == MAIL_RECEIVED:
        await handle_mail_received(payload)
        return True
    if event in (MAIL_SENT, MAIL_MOVED, MAIL_OPENED, MAIL_LINK_CLICKED, NEW_RELATION):
        logger.info("Unipile event %s (account %s)", event, payload.get("account_id", "n/a"))
        return True
    # Acknowledge unknown events so Unipile doesn't retry them.
    logger.warning("Unhandled Unipile event: %s", event)
    return False


@app.post("/webhooks/unipile", dependencies=[Depends(require_unipile_secret)])
async def unipile_webhook(request: Request):
    # API-created webhooks send no JSON Content-Type by default, so parse the raw body.
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict) or not (
        isinstance(payload.get("event"), str) or payload.get("AccountStatus")
    ):
        raise HTTPException(status_code=400, detail="Missing event field")

    logger.info(
        "Unipile webhook: %s key=%s", payload.get("event", "account_status"), dedupe_key(payload)
    )

    try:
        await dispatch(payload)
    except Exception as err:  # noqa: BLE001
        logger.error("Unipile webhook processing failed: %s", err)
        # Unipile retries up to 5 times unless it gets a 200 within 30 seconds.
        raise HTTPException(status_code=500, detail="Processing failed")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
