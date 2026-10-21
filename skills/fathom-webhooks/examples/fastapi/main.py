# Generated with: fathom-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fathom_python import Fathom

load_dotenv()

logger = logging.getLogger("fathom-webhooks")

app = FastAPI(title="Fathom Webhooks")


def handle_meeting(meeting: dict, webhook_id: str) -> None:
    """Handle a verified Fathom "new meeting content ready" payload.

    Fathom sends one webhook type: the Meeting object, fired once when a
    recording's content is ready. There is no event-type field to switch on.
    transcript, default_summary, action_items and crm_matches are only present
    when the matching include_* option was enabled on the webhook.
    """
    logger.info(
        'Meeting ready: "%s" (recording %s, delivery %s)',
        meeting.get("title"),
        meeting.get("recording_id"),
        webhook_id,
    )

    summary = (meeting.get("default_summary") or {}).get("markdown_formatted")
    if summary:
        logger.info("Summary: %s", summary)

    for item in meeting.get("action_items") or []:
        assignee = (item.get("assignee") or {}).get("email") or "unassigned"
        logger.info("Action item: %s (assignee: %s)", item.get("description"), assignee)

    if meeting.get("transcript"):
        logger.info("Transcript: %d lines", len(meeting["transcript"]))

    # TODO: Sync notes to your CRM, post the summary to Slack, create tasks, etc.
    # Deduplicate on webhook_id: it stays the same when Fathom retries a delivery.


@app.post("/webhooks/fathom")
async def fathom_webhook(request: Request):
    secret = os.environ.get("FATHOM_WEBHOOK_SECRET")
    if not secret:
        logger.error("FATHOM_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    webhook_id = request.headers.get("webhook-id")
    webhook_timestamp = request.headers.get("webhook-timestamp")
    webhook_signature = request.headers.get("webhook-signature")

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        raise HTTPException(
            status_code=400,
            detail="Missing webhook-id, webhook-timestamp or webhook-signature header",
        )

    # Raw body - verification must run on the exact bytes Fathom sent
    raw_body = await request.body()

    try:
        # Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}"
        # and rejects timestamps more than 5 minutes old. Returns the parsed payload.
        meeting = Fathom.verify_webhook(
            secret,
            {
                "webhook-id": webhook_id,
                "webhook-timestamp": webhook_timestamp,
                "webhook-signature": webhook_signature,
            },
            raw_body.decode("utf-8"),
        )
    except Exception as err:
        logger.error("Fathom webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        handle_meeting(meeting, webhook_id)
    except Exception:
        logger.exception("Error handling Fathom webhook")
        raise HTTPException(status_code=500, detail="Internal error")

    # Return 2xx quickly - non-2xx responses and timeouts are retried
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
