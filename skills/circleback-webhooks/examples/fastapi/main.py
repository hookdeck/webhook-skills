# Generated with: circleback-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("circleback-webhooks")

app = FastAPI(title="Circleback Webhooks")

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_circleback_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    """Verify Circleback's x-signature: bare hex HMAC-SHA256 of the raw body,
    keyed with the signing secret (UTF-8). No timestamp, no prefix."""
    if not signature or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # Compare bytes, not str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(expected, signature.lower().encode())


def handle_meeting(meeting: dict) -> None:
    """Handle a verified Circleback meeting export.

    Circleback has no event types: every delivery is one meeting. Which fields
    are present follows the automation's settings (notes, action items,
    transcript, insights).
    """
    logger.info('Meeting: "%s" (%s, %ss)', meeting.get("name"), meeting.get("id"), meeting.get("duration"))
    logger.info("Link: https://circleback.ai/meetings/%s", meeting.get("id"))

    if meeting.get("notes"):
        logger.info("Notes: %s", meeting["notes"])

    for item in meeting.get("actionItems") or []:
        assignee = (item.get("assignee") or {}).get("email") or "unassigned"
        logger.info("Action item [%s]: %s (assignee: %s)", item.get("status"), item.get("title"), assignee)

    if meeting.get("transcript"):
        logger.info("Transcript: %d segments", len(meeting["transcript"]))

    # TODO: Sync notes to your CRM, post the summary to Slack, create tasks, etc.
    # Deduplicate on meeting["id"]: Circleback sends no delivery ID header.


@app.post("/webhooks/circleback")
async def circleback_webhook(request: Request):
    secret = os.environ.get("CIRCLEBACK_SIGNING_SECRET")
    if not secret:
        logger.error("CIRCLEBACK_SIGNING_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Raw body - verification must run on the exact bytes Circleback sent
    raw_body = await request.body()

    if not verify_circleback_signature(raw_body, request.headers.get("x-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        meeting = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    try:
        handle_meeting(meeting)
    except Exception:
        logger.exception("Error handling Circleback webhook")
        raise HTTPException(status_code=500, detail="Internal error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
