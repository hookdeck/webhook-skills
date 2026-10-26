# Generated with: missive-webhooks skill
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

logger = logging.getLogger("missive-webhooks")

app = FastAPI(title="Missive Webhooks")

PREFIX = "sha256="
HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_missive_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    """Verify Missive's X-Hook-Signature: "sha256=" + hex HMAC-SHA256 of the raw
    body, keyed with the rule's validation secret (UTF-8). No timestamp."""
    if not header or not header.startswith(PREFIX):
        return False
    sig = header[len(PREFIX):]
    if not HEX_SHA256.fullmatch(sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # Compare bytes, not str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(expected, sig.lower().encode())


def handle_rule(payload: dict) -> None:
    """Handle a verified Missive rule webhook.

    Missive has no event header: dispatch on payload["rule"]["type"]. The docs'
    payload example is label_change; other rule types are chosen in the rule UI.
    """
    rule = payload.get("rule") or {}
    rule_type = rule.get("type")
    conversation = payload.get("conversation") or {}

    if rule_type == "label_change":
        logger.info('Label change on "%s" (%s)', conversation.get("subject"), conversation.get("id"))
        logger.info("Shared labels: %s", conversation.get("shared_label_names") or "(none)")
        # TODO: Notify a channel, create a task, sync labels to your CRM, etc.
    elif rule_type is None:
        # Verified body without a rule (for example the validation request sent on save)
        logger.info("Missive request without rule.type acknowledged")
    else:
        logger.info("Unhandled Missive rule type: %s (rule %s)", rule_type, rule.get("id"))

    message = payload.get("latest_message")
    if message:
        logger.info("Latest message (%s): %s", message.get("type"), message.get("subject") or message.get("preview"))
    # Missive retries failed deliveries: deduplicate on rule.id + conversation.id + message id.


@app.post("/webhooks/missive")
async def missive_webhook(request: Request):
    secret = os.environ.get("MISSIVE_WEBHOOK_SECRET")
    if not secret:
        logger.error("MISSIVE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Raw body - verification must run on the exact bytes Missive sent
    raw_body = await request.body()

    if not verify_missive_signature(raw_body, request.headers.get("x-hook-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    try:
        handle_rule(payload)
    except Exception:
        logger.exception("Error handling Missive webhook")
        raise HTTPException(status_code=500, detail="Internal error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
