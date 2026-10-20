# Generated with: render-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Render webhook receiver for FastAPI.

Render signs webhook notifications with Standard Webhooks:
  webhook-id         the service event ID (evt-...), same on every retry
  webhook-timestamp  Unix seconds when this delivery attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: the signing secret from the webhook's Settings page in the Render
Dashboard. The SDK strips an optional `whsec_` prefix and base64-decodes it.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("render-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Render Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production —
# Render retries failed deliveries (up to 8 attempts) with the same data.id.
processed_event_ids: set = set()


def verify_render_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Render delivery with the Standard Webhooks SDK.

    Render's docs recommend the Standard Webhooks libraries. The SDK checks
    the timestamp (5-minute tolerance), recomputes the HMAC over the raw body,
    and compares in constant time against every `v1,` entry. Raises on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_render_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Render notification or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("RENDER_WEBHOOK_SECRET")
    if not secret:
        logger.error("RENDER_WEBHOOK_SECRET is not set — rejecting delivery")
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
        return verify_render_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Render webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    """Dispatch on Render's "thin" payload.

    {type, timestamp, data: {id, serviceId, serviceName, status?}}. `status`
    (succeeded | failed | canceled) is only present on build_ended,
    deploy_ended, cron_job_run_ended and job_run_ended. Fetch full details
    with GET https://api.render.com/v1/events/{data.id}.
    """
    event_type = event.get("type")
    data = event.get("data") or {}
    service = f"{data.get('serviceName')} ({data.get('serviceId')})"
    status = data.get("status")

    # --- Deployment lifecycle ------------------------------------------------
    if event_type == "build_started":
        logger.info("Build started for %s", service)
    elif event_type == "build_ended":
        logger.info("Build ended for %s: %s", service, status)
    elif event_type == "deploy_started":
        logger.info("Deploy started for %s", service)
    elif event_type == "deploy_ended":
        if status == "succeeded":
            # e.g. trigger smoke tests or deploy a dependent service
            logger.info("Deploy succeeded for %s", service)
        else:
            logger.info("Deploy %s for %s", status, service)
    elif event_type in (
        "pre_deploy_started",
        "pre_deploy_ended",
        "commit_ignored",
        "branch_deleted",
        "image_pull_failed",
        "pipeline_minutes_exhausted",
    ):
        logger.info("%s for %s", event_type, service)

    # --- Jobs and cron jobs --------------------------------------------------
    elif event_type == "cron_job_run_started":
        logger.info("Cron job run started for %s", service)
    elif event_type in ("cron_job_run_ended", "job_run_ended"):
        logger.info("%s for %s: %s", event_type, service, status)

    # --- Service availability ------------------------------------------------
    elif event_type in ("server_failed", "server_hardware_failure"):
        # Page someone / post to chat — the service is down.
        logger.info("Service unavailable: %s (%s)", service, event_type)
    elif event_type in (
        "server_available",
        "server_restarted",
        "service_suspended",
        "service_resumed",
    ):
        logger.info("%s for %s", event_type, service)

    # --- Scaling ---------------------------------------------------------------
    elif event_type in ("autoscaling_started", "autoscaling_ended", "instance_count_changed"):
        # Instance counts are in the Retrieve event API response (details).
        logger.info("%s for %s", event_type, service)

    # --- Render Postgres / Key Value ------------------------------------------
    elif event_type in ("postgres_unavailable", "key_value_unhealthy"):
        logger.info("Datastore problem: %s for %s", event_type, service)
    elif event_type in ("postgres_available", "key_value_available"):
        logger.info("%s for %s", event_type, service)

    else:
        # Render adds event types over time — acknowledge anything unknown.
        logger.info("Unhandled Render event type: %s", event_type)


@app.post("/webhooks/render")
async def render_webhook(event: Dict[str, Any] = Depends(verified_render_event)):
    # data.id is identical across retries — acknowledge duplicates with 200.
    event_id = (event.get("data") or {}).get("id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast: Render needs a 2xx within 15 seconds. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Render event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
