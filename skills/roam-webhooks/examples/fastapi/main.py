# Generated with: roam-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("roam-webhooks")

app = FastAPI(title="Roam Webhooks")

# Event IDs already handled (in-memory for the example; use a database or Redis in production)
seen: set = set()


def is_v1_envelope(event) -> bool:
    """One Roam event can arrive as two POSTs with the same webhook-id: a legacy
    tagged-id body (type: "message") and the v1 envelope (type: "chat.message").
    Only the v1 envelope has a dotted type and a data object."""
    return (
        isinstance(event, dict)
        and isinstance(event.get("type"), str)
        and "." in event["type"]
        and isinstance(event.get("data"), dict)
    )


def handle_event(event: dict) -> None:
    """Handle a verified Roam v1 envelope: type, eventId, timestamp, apiVersion, data."""
    event_type = event["type"]
    data = event["data"]

    if event_type == "chat.message":
        if data.get("contentType") == "deleted":
            logger.info("Chat message deleted in chat %s", data.get("chatId"))
        else:
            logger.info("Chat message in chat %s (version %s)", data.get("chatId"), data.get("version"))
    elif event_type == "chat.reaction":
        logger.info("Chat reaction event for chat %s", data.get("chatId"))
    elif event_type == "meeting.started":
        logger.info("Meeting started: %s", data.get("id"))
    elif event_type == "meeting.ended":
        logger.info("Meeting ended: %s (%s)", data.get("title"), data.get("id"))
    elif event_type == "lobby.booked":
        logger.info("Lobby booked")
    elif event_type == "magicast.created":
        logger.info("Magicast created")
    elif event_type == "onair.event.created":
        logger.info("On-Air event created")
    else:
        logger.info("Unhandled Roam event: %s", event_type)

    # TODO: acknowledge first, then do the real work in a background job


@app.post("/webhooks/roam")
async def roam_webhook(request: Request):
    secret = os.environ.get("ROAM_WEBHOOK_SIGNING_SECRET")
    if not secret:
        logger.error("ROAM_WEBHOOK_SIGNING_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    webhook_id = request.headers.get("webhook-id")
    webhook_timestamp = request.headers.get("webhook-timestamp")
    webhook_signature = request.headers.get("webhook-signature")

    # Unsigned deliveries (no signing secret configured in Roam) lack these headers
    if not webhook_id or not webhook_timestamp or not webhook_signature:
        raise HTTPException(
            status_code=400,
            detail="Missing webhook-id, webhook-timestamp or webhook-signature header",
        )

    # Raw body (any content type) - verification must run on the exact bytes Roam sent
    raw_body = await request.body()

    try:
        # Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}",
        # rejects timestamps more than 5 minutes off, and returns the parsed payload.
        # Behind Hookdeck retries/replays, use the manual verifier in references/verification.md.
        event = Webhook(secret).verify(
            raw_body,
            {
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": webhook_signature,
            },
        )
    except Exception as err:
        logger.error("Roam webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Legacy body of the same event: acknowledge and skip, the v1 body carries the same webhook-id
    if not is_v1_envelope(event):
        return {"received": True, "ignored": "legacy body"}

    # Dedupe on webhook-id (retries reuse it)
    if webhook_id in seen:
        return {"received": True, "duplicate": True}

    try:
        handle_event(event)
        seen.add(webhook_id)
    except Exception:
        logger.exception("Error handling Roam webhook")
        raise HTTPException(status_code=500, detail="Internal error")

    # Respond within 3 seconds; 2xx = delivered
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
