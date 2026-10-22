# Generated with: granola-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("granola-webhooks")

app = FastAPI(title="Granola Webhooks")


def handle_event(event: dict) -> None:
    """Handle a verified Granola event.

    Payloads carry no note content, only event_id, event_type, note_id and
    occurred_at (plus data.changed_fields on note.edited). Fetch the note with
    Get Note and your Granola API key.
    """
    event_type = event.get("event_type")
    note_id = event.get("note_id")

    if event_type == "note.generated":
        logger.info("Note generated: %s", note_id)
    elif event_type == "note.edited":
        changed = (event.get("data") or {}).get("changed_fields") or []
        logger.info("Note edited: %s (changed: %s)", note_id, ", ".join(changed))
    elif event_type == "note.access_granted":
        logger.info("Note shared with you: %s", note_id)
    else:
        logger.info("Unhandled Granola event: %s", event_type)

    # TODO: GET https://public-api.granola.ai/v1/notes/{note_id} with your API key,
    # then sync the summary to your CRM, wiki, etc.
    # Deduplicate on event_id: retries reuse it.


@app.post("/webhooks/granola")
async def granola_webhook(request: Request):
    secret = os.environ.get("GRANOLA_WEBHOOK_SECRET")
    if not secret:
        logger.error("GRANOLA_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    webhook_id = request.headers.get("webhook-id")
    webhook_timestamp = request.headers.get("webhook-timestamp")
    webhook_signature = request.headers.get("webhook-signature")

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        raise HTTPException(
            status_code=400,
            detail="Missing webhook-id, webhook-timestamp or webhook-signature header",
        )

    # Raw body - verification must run on the exact bytes Granola sent
    raw_body = await request.body()

    try:
        # Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}",
        # rejects timestamps more than 5 minutes off, and returns the parsed payload.
        event = Webhook(secret).verify(
            raw_body,
            {
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": webhook_signature,
            },
        )
    except Exception as err:
        logger.error("Granola webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        handle_event(event)
    except Exception:
        logger.exception("Error handling Granola webhook")
        raise HTTPException(status_code=500, detail="Internal error")

    # Respond within 15 seconds; 2xx = delivered
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
