# Generated with: opnform-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("opnform-webhooks")
app = FastAPI()

# OpnForm signs deliveries only when a webhook secret is set on the integration:
#   X-Webhook-Signature: sha256=<lowercase hex HMAC-SHA256 of the raw body>
# The key is the secret as UTF-8 bytes. Nothing else is signed (no timestamp), so there is no
# replay window; use submission_id for idempotency.
# https://docs.opnform.com/api-reference/integrations/webhook-security


def verify_opnform(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    # The prefix is optional: Hookdeck's OpnForm source accepts the bare digest too
    sig = signature_header.strip()
    if sig.startswith("sha256="):
        sig = sig[len("sha256="):]
    # Only a well-formed 64-character hex digest is compared; hex is case-insensitive.
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False

    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig.lower().encode(), expected.encode())


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("OPNFORM_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("OPNFORM_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_opnform(raw_body, request.headers.get("x-webhook-signature"), secret):
        logger.error("OpnForm webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/opnform")
async def opnform_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    # Signed does not mean well-formed: the fields come from whoever filled in the form
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Every delivery is a form submission; there is no event name to switch on.
    # submission_id identifies it: use it to drop duplicates (see webhook-handler-patterns)
    submission = payload.get("submission")
    field_count = len(submission) if isinstance(submission, dict) else 0
    title = payload.get("form_title")
    title = title if isinstance(title, str) else "unknown form"
    form_id = payload.get("form_id")
    form_id = form_id if isinstance(form_id, (int, str)) else "?"
    submission_id = payload.get("submission_id")
    submission_id = submission_id if isinstance(submission_id, (int, str)) else "?"

    logger.info(
        'Form submission %s on "%s" (form %s): %d fields', submission_id, title, form_id, field_count
    )

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
