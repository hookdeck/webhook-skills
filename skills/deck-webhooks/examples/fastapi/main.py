# Generated with: deck-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Deck (deck.co) webhook receiver for FastAPI.

Deck signs `webhook` destinations with Standard Webhooks:
  webhook-id         unique event identifier
  webhook-timestamp  Unix seconds when the delivery was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.

Deck does NOT generate the secret. You create it ("whsec_" + base64 of random
bytes) and pass it as `webhook.secret` when creating the destination.
"""

import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("deck-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Deck Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production —
# Deck delivers at least once and retries if you don't 2xx within 5 seconds.
processed_event_ids: set = set()


def get_secrets() -> List[str]:
    """Secrets to try, current first.

    During a rotation Deck keeps the previous secret valid for 24 hours, so
    DECK_WEBHOOK_SECRET_PREVIOUS is accepted too.
    """
    candidates = [
        os.environ.get("DECK_WEBHOOK_SECRET"),
        os.environ.get("DECK_WEBHOOK_SECRET_PREVIOUS"),
    ]
    return [s for s in candidates if s]


def verify_deck_webhook(
    raw_body: bytes, headers: Dict[str, str], secrets: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Verify a Deck delivery with the official Standard Webhooks SDK.

    The SDK checks the timestamp (5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises if no configured secret verifies the delivery.
    """
    secrets = get_secrets() if secrets is None else secrets
    last_error: Exception = ValueError("No signing secret configured")
    for secret in secrets:
        try:
            return Webhook(secret).verify(raw_body, headers)
        except Exception as err:  # WebhookVerificationError, bad base64, etc.
            last_error = err
    raise last_error


async def verified_deck_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Deck event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not get_secrets():
        logger.error("DECK_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body — request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_deck_webhook(raw_body, headers)
    except Exception as err:
        logger.error("Deck webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    # --- Task runs -----------------------------------------------------------
    if event_type == "task_run.interaction_required":
        # Time-sensitive: the user is waiting (MFA, security question, account
        # selection) and the interaction window is 5 minutes. Build your prompt
        # from data["interaction"]["fields"], then answer with
        # POST /v2/task-runs/{data["id"]}/interaction  {"input": {"<field name>": "<value>"}}
        interaction = data.get("interaction") or {}
        logger.info(
            "Task run %s needs %s: %s",
            data.get("id"),
            interaction.get("type"),
            interaction.get("message"),
        )
    elif event_type == "task_run.completed":
        logger.info(
            "Task run %s completed (result=%s, %sms)",
            data.get("id"),
            data.get("result"),
            data.get("runtime_ms"),
        )
    elif event_type == "task_run.failed":
        logger.info("Task run %s failed (result=%s)", data.get("id"), data.get("result"))
    elif event_type in (
        "task_run.queued",
        "task_run.running",
        "task_run.canceling",
        "task_run.canceled",
    ):
        logger.info("Task run %s -> %s", data.get("id"), data.get("status"))

    # --- Credentials (Deck Vault) -------------------------------------------
    elif event_type == "credential.verified":
        logger.info("Credential %s verified for user %s", data.get("id"), data.get("external_id"))
    elif event_type == "credential.invalid":
        # The source rejected the login — ask your user to update credentials.
        logger.info("Credential %s invalid for user %s", data.get("id"), data.get("external_id"))
    elif event_type in ("credential.created", "credential.unverified", "credential.deleted"):
        logger.info("Credential %s -> %s", data.get("id"), data.get("status"))

    # --- Workflow runs (note: workflow_run_id, not id) -----------------------
    elif event_type in (
        "workflow_run.completed",
        "workflow_run.failed",
        "workflow_run.canceled",
    ):
        logger.info(
            "Workflow run %s %s (result=%s)",
            data.get("workflow_run_id"),
            data.get("status"),
            data.get("result"),
        )
    elif event_type in (
        "workflow_run.queued",
        "workflow_run.running",
        "workflow_run.paused",
        "workflow_run.canceling",
    ):
        logger.info("Workflow run %s -> %s", data.get("workflow_run_id"), data.get("status"))

    # --- Storage -------------------------------------------------------------
    elif event_type == "storage.created":
        logger.info(
            "File stored: %s (%s) from task run %s",
            data.get("file_name"),
            data.get("file_type"),
            data.get("task_run_id"),
        )
    elif event_type == "storage.deleted":
        logger.info("File deleted: %s", data.get("id"))

    # --- Sessions ------------------------------------------------------------
    elif event_type in (
        "session.queued",
        "session.running",
        "session.idle",
        "session.completing",
        "session.completed",
        "session.failed",
    ):
        logger.info("Session %s -> %s", data.get("id"), data.get("status"))

    # --- Event destinations --------------------------------------------------
    elif event_type in ("event_destination.activated", "event_destination.deactivated"):
        logger.info("Destination %s is now %s", data.get("id"), data.get("status"))

    # --- Definitions: agents, sources, tasks, workflows ----------------------
    elif event_type in (
        "agent.created",
        "agent.updated",
        "agent.deleted",
        "source.created",
        "source.updated",
        "source.deleted",
        "task.created",
        "task.updated",
        "task.reset",
        "task.deleted",
    ):
        logger.info("%s: %s", event_type, data.get("id"))
    elif event_type in ("workflow.created", "workflow.updated", "workflow.deleted"):
        logger.info("%s: %s", event_type, data.get("workflow_id"))

    # --- Test ping (Console "Send test ping" / POST .../test) ----------------
    elif event_type == "test.ping":
        logger.info("Received Deck test.ping")

    else:
        logger.info("Unhandled Deck event type: %s", event_type)


@app.post("/webhooks/deck")
async def deck_webhook(event: Dict[str, Any] = Depends(verified_deck_event)):
    # Duplicates are normal (at-least-once delivery) — acknowledge with 200.
    event_id = event.get("id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast: Deck needs a 2xx within 5 seconds. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Deck event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
