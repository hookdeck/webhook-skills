# Generated with: humaans-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("humaans-webhooks")

app = FastAPI(title="Humaans Webhooks")


def handle_event(event: dict) -> None:
    """Handle a verified Humaans event.

    The body is a wrapper { id, seq, ts, action, subject, actor, entity };
    dispatch on `action`.
    """
    action = event.get("action")
    subject_id = (event.get("subject") or {}).get("id")
    entity = event.get("entity") or {}

    if action == "person.created":
        logger.info("Person created: %s", subject_id)
    elif action == "person.updated":
        logger.info("Person updated: %s (changed: %s)", subject_id, ", ".join(entity.get("fieldsChanged") or []))
    elif action == "person.offboarded":
        logger.info("Person offboarded: %s", subject_id)
    elif action == "timeAway.created":
        logger.info("Time away requested: %s", entity.get("id"))
    elif action == "timeAway.approved":
        logger.info("Time away approved: %s", entity.get("id"))
    elif action == "compensation.updated":
        logger.info(
            "Compensation updated: %s (%s)",
            entity.get("id"),
            (entity.get("metadata") or {}).get("type", "unknown type"),
        )
    else:
        logger.info("Unhandled Humaans event: %s", action)

    # TODO: sync the change to payroll, your directory, etc.
    # Deduplicate on the webhook-id header: retries reuse it.


def header(request: Request, name: str):
    # Humaans delivers via Svix, which may send webhook-* or svix-* headers
    return request.headers.get(f"webhook-{name}") or request.headers.get(f"svix-{name}")


@app.post("/webhooks/humaans")
async def humaans_webhook(request: Request):
    secret = os.environ.get("HUMAANS_WEBHOOK_SECRET")
    if not secret:
        logger.error("HUMAANS_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    webhook_id = header(request, "id")
    webhook_timestamp = header(request, "timestamp")
    webhook_signature = header(request, "signature")

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        raise HTTPException(
            status_code=400,
            detail="Missing webhook-id, webhook-timestamp or webhook-signature header",
        )

    # Raw body - verification must run on the exact bytes Humaans sent
    raw_body = await request.body()

    try:
        # Verifies HMAC-SHA256 over "{id}.{timestamp}.{raw body}", rejects timestamps
        # more than 5 minutes off, and returns the parsed payload. Behind Hookdeck,
        # retries and replays keep the original timestamp: for those, use the manual
        # verifier in references/verification.md and choose your own window.
        event = Webhook(secret).verify(
            raw_body,
            {
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": webhook_signature,
            },
        )
    except Exception as err:
        logger.error("Humaans webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        handle_event(event)
    except Exception:
        logger.exception("Error handling Humaans webhook")
        raise HTTPException(status_code=500, detail="Internal error")

    # Any 2xx = delivered; other responses are retried with exponential backoff
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
