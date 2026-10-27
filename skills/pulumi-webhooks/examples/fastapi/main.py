# Generated with: pulumi-webhooks skill
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

logger = logging.getLogger("pulumi-webhooks")
app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_pulumi(raw_body: bytes, signature, secret: str) -> bool:
    """Pulumi Cloud signs a delivery only when the webhook has a shared secret.

    Pulumi-Webhook-Signature is the bare lowercase hex HMAC-SHA256 of the raw request body, keyed
    with the secret's UTF-8 bytes. Nothing else (no timestamp, no id) is signed.
    https://www.pulumi.com/docs/deployments/concepts/webhooks/
    (The docs' Python snippet base64-encodes the digest, which contradicts the header table: use hex.)
    """
    if not secret or not signature:
        return False
    # Exactly 64 hex chars first, so the compare below sees well-formed ASCII only
    if not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # bytes on both sides: compare_digest on str raises TypeError for non-ASCII
    return hmac.compare_digest(signature.lower().encode(), expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("PULUMI_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("PULUMI_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_pulumi(raw_body, request.headers.get("pulumi-webhook-signature"), secret):
        logger.error("Pulumi webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/pulumi")
async def pulumi_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body has no event name: the Pulumi-Webhook-Kind header says which kind of event it is
    kind = request.headers.get("pulumi-webhook-kind")
    where = f"{event.get('projectName')}/{event.get('stackName')}"

    if kind == "stack":
        # event["action"] says what happened to the stack (for example created)
        logger.info("Stack %s: %s", event.get("action"), where)
    elif kind == "stack_update":
        # event["kind"] is the operation (update, refresh, ...), event["result"] is succeeded or failed
        logger.info("Stack update (%s) %s: %s %s", event.get("kind"), event.get("result"), where, event.get("updateUrl"))
    elif kind == "stack_preview":
        logger.info("Stack preview (%s) %s: %s %s", event.get("kind"), event.get("result"), where, event.get("updateUrl"))
    elif kind == "deployment":
        # event["status"] is the deployment state (for example running)
        logger.info("Deployment %s %s %s: %s", event.get("version"), event.get("operation"), event.get("status"), where)
    elif kind == "drift_detection":
        logger.info("Drift detection %s (drift detected: %s): %s", event.get("status"), event.get("driftDetected"), where)
    elif kind == "drift_remediation":
        logger.info("Drift remediation %s: %s", event.get("status"), where)
    else:
        # Includes policy_violation: log it, or add a branch for it
        logger.info("Unhandled event kind: %s", kind)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
