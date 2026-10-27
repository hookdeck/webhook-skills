# Generated with: salsa-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Salsa webhook receiver for FastAPI.

Salsa delivers webhooks with Standard Webhooks signatures:
  webhook-id         unique event identifier
  webhook-timestamp  Unix seconds when the webhook was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's `signatureSecret` after its `whsec_` prefix.
Hookdeck's Salsa source also accepts the svix-* header names when webhook-id
is absent, so this handler does the same.
"""

import logging
import os
from typing import Any, Dict, Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("salsa-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Salsa Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Salsa's body carries no event id, but webhook-id is the same when an event is
# resent after a failure.
processed_message_ids: set = set()


def resolve_signature_headers(headers) -> Optional[Dict[str, str]]:
    """Read the three signature headers: webhook-* first, svix-* when
    webhook-id is absent. Returns them under the webhook-* names the library
    expects, or None if any is missing."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    msg_id = headers.get(f"{prefix}-id")
    timestamp = headers.get(f"{prefix}-timestamp")
    signature = headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        return None
    return {
        "webhook-id": msg_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
    }


def verify_salsa_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Salsa delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure and returns the parsed
    JSON body on success.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_salsa_event(request: Request) -> Tuple[str, Dict[str, Any]]:
    """FastAPI dependency: returns (webhook-id, verified event) or raises."""
    secret = os.environ.get("SALSA_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SALSA_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return headers["webhook-id"], verify_salsa_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Salsa webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    # Body shape: {"data": {"type": "Employer.created", "attributes": {...}}}
    body = event.get("data") or {}
    event_type = body.get("type")
    attributes = body.get("attributes") or {}
    employer_id = attributes.get("employerId")

    # --- Employers -----------------------------------------------------------
    if event_type in ("Employer.created", "Employer.updated"):
        logger.info("%s: employer %s (external id %s)", event_type, employer_id, attributes.get("externalId"))
    elif event_type == "Employer.onboardingStatus":
        logger.info("Employer onboarding status changed: %s", employer_id)

    # --- Workers -------------------------------------------------------------
    elif event_type in ("Worker.created", "Worker.updated"):
        logger.info("%s: worker for employer %s", event_type, employer_id)
    elif event_type == "Worker.onboardingStatus":
        logger.info("Worker onboarding status changed for employer %s", employer_id)

    # --- Payroll runs --------------------------------------------------------
    elif event_type == "PayrollRun.awaitingInput":
        # Salsa needs compensation data for the listed workers before the run can proceed.
        logger.info("Payroll run awaiting input for employer %s", employer_id)
    elif event_type == "PayrollRun.statusChanged":
        logger.info("Payroll run status changed for employer %s", employer_id)

    # --- Notifications (attributes.category == "NOTIFICATION") ---------------
    elif event_type == "Notification.workerPayday":
        # Sent on the day the worker is paid (1pm or 11pm UTC). Not sent in the
        # sandbox for Direct Deposit workers.
        logger.info("Worker payday notification for employer %s", employer_id)
    elif event_type == "Notification.employerPayrollRunConfirmation":
        logger.info("Payroll run confirmed for employer %s", employer_id)

    # --- Documents and accounting -------------------------------------------
    elif event_type == "Document.uploaded":
        logger.info("Document uploaded for employer %s", employer_id)
    elif event_type in ("AccountingConfiguration.created", "AccountingConfiguration.updated"):
        logger.info("%s: employer %s", event_type, employer_id)

    else:
        # Salsa documents more than 70 event types; the list may not be exhaustive.
        logger.info("Unhandled Salsa event type: %s", event_type)


@app.post("/webhooks/salsa")
async def salsa_webhook(verified: Tuple[str, Dict[str, Any]] = Depends(verified_salsa_event)):
    message_id, event = verified

    # A resent event keeps its webhook-id; acknowledge duplicates with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Salsa event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
