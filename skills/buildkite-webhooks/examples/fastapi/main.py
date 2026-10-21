# Generated with: buildkite-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("buildkite-webhooks")
app = FastAPI()

# Buildkite sends one of two headers, depending on the webhook's Token setting:
# - X-Buildkite-Token (default): the token in plain text
# - X-Buildkite-Signature: "timestamp=<unix>,signature=<hex>", where signature is
#   HMAC-SHA256 of "<timestamp>.<raw body>" keyed with the token
# https://buildkite.com/docs/apis/webhooks/pipelines

# Buildkite suggests rejecting old timestamps (e.g. 5 minutes) to defend against replay.
TIMESTAMP_TOLERANCE_SECONDS = 5 * 60


def parse_signature_header(header: str) -> dict:
    parts = {}
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        if sep and key.strip():
            parts[key.strip()] = value.strip()
    return parts


def verify_buildkite(raw_body: bytes, headers, token: str) -> bool:
    if not token:
        return False

    signature_header = headers.get("x-buildkite-signature")
    if signature_header:
        parts = parse_signature_header(signature_header)
        timestamp, signature = parts.get("timestamp"), parts.get("signature")
        if not timestamp or not signature:
            return False
        try:
            ts = int(timestamp)
        except ValueError:
            return False
        if abs(time.time() - ts) > TIMESTAMP_TOLERANCE_SECONDS:
            return False

        signed = timestamp.encode() + b"." + raw_body
        expected = hmac.new(token.encode(), signed, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature.encode(), expected.encode())

    # Token mode: constant-time compare of the plain-text header
    token_header = headers.get("x-buildkite-token")
    return bool(token_header) and hmac.compare_digest(token_header.encode(), token.encode())


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    token = os.getenv("BUILDKITE_WEBHOOK_TOKEN", "")
    if not token:
        logger.error("BUILDKITE_WEBHOOK_TOKEN is not set")
        raise HTTPException(status_code=500, detail="Webhook token not configured")

    raw_body = await request.body()
    if not verify_buildkite(raw_body, request.headers, token):
        logger.error("Buildkite webhook verification failed")
        raise HTTPException(status_code=400, detail="Invalid token or signature")
    return raw_body


@app.post("/webhooks/buildkite")
async def buildkite_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = request.headers.get("x-buildkite-event") or payload.get("event")

    if event == "ping":
        logger.info("Ping received")
    elif event in ("build.scheduled", "build.running", "build.failing"):
        logger.info("Build %s (%s)", (payload.get("build") or {}).get("number"), event)
    elif event == "build.finished":
        build = payload.get("build") or {}
        logger.info("Build %s finished: %s", build.get("number"), build.get("state"))
    elif event in ("job.started", "job.finished"):
        logger.info("Job %s (%s)", (payload.get("job") or {}).get("id"), event)
    elif event == "agent.connected":
        logger.info("Agent connected: %s", (payload.get("agent") or {}).get("name"))
    else:
        logger.info("Unhandled event: %s", event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
