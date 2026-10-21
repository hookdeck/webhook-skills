# Generated with: nango-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

logger = logging.getLogger("nango-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI()


def verify_nango_signature(raw_body: bytes, signature: Optional[str], signing_key: str) -> bool:
    """Verify X-Nango-Hmac-Sha256: hex HMAC-SHA256 of the raw body.

    Nango has no Python SDK for this, so it's done manually. The key is the
    environment's webhook signing key (not the API key), used as UTF-8 bytes.
    """
    if not signature:
        return False
    expected = hmac.new(signing_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


def handle_auth(webhook: dict) -> None:
    operation = webhook.get("operation")
    success = webhook.get("success")
    connection_id = webhook.get("connectionId")
    provider_config_key = webhook.get("providerConfigKey")

    if operation == "creation":
        if success:
            # Required: save connectionId against the user/org that started the flow
            logger.info("Connection created: %s (%s) tags=%s", connection_id, provider_config_key, webhook.get("tags"))
        else:
            logger.info("Connection creation failed (%s): %s", provider_config_key, webhook.get("error"))
    elif operation == "override":
        logger.info("Connection re-authorized: %s (success=%s)", connection_id, success)
    elif operation == "refresh":
        if success:
            logger.info("Connection recovered after refresh failure: %s", connection_id)
        else:
            logger.info("Token refresh failed for %s: %s", connection_id, webhook.get("error"))
    elif operation == "deletion":
        logger.info("Connection deleted: %s", connection_id)
    else:
        logger.info("Unhandled auth operation: %s", operation)


def is_full_sync(webhook: dict) -> bool:
    # checkpoints may be missing or null; treat that (or from == null) as a full sync
    checkpoints = webhook.get("checkpoints")
    return not checkpoints or checkpoints.get("from") is None


def handle_sync(webhook: dict) -> None:
    connection_id = webhook.get("connectionId")
    sync_name = webhook.get("syncName")

    if not webhook.get("success"):
        logger.info("Sync %s failed for %s: %s", sync_name, connection_id, webhook.get("error"))
        return

    logger.info(
        "Sync %s (%s) succeeded for %s modifiedAfter=%s results=%s full=%s",
        sync_name,
        webhook.get("model"),
        connection_id,
        webhook.get("modifiedAfter"),
        webhook.get("responseResults"),
        is_full_sync(webhook),
    )
    # Fetch changed records here via Nango's records API, using a cursor


def handle_forward(webhook: dict) -> None:
    if webhook.get("unverified"):
        # Nango could not check the external provider's signature; treat as untrusted
        logger.warning("Unverified forward from %s", webhook.get("from"))
    logger.info(
        "Forwarded %s webhook for connection %s",
        webhook.get("from"),
        webhook.get("connectionId") or "(unattributed)",
    )


@app.post("/webhooks/nango")
async def nango_webhook(
    request: Request,
    x_nango_hmac_sha256: Optional[str] = Header(default=None),
):
    signing_key = os.environ.get("NANGO_WEBHOOK_SIGNING_KEY")
    if not signing_key:
        logger.error("NANGO_WEBHOOK_SIGNING_KEY is not set")
        raise HTTPException(status_code=500, detail="Webhook verification not configured")

    if not x_nango_hmac_sha256:
        raise HTTPException(status_code=400, detail="Missing X-Nango-Hmac-Sha256 header")

    # Verify against the raw body bytes, never re-serialised JSON
    raw_body = await request.body()
    if not verify_nango_signature(raw_body, x_nango_hmac_sha256, signing_key):
        logger.error("Nango webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        webhook = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    webhook_type = webhook.get("type") if isinstance(webhook, dict) else None

    if webhook_type == "auth":
        handle_auth(webhook)
    elif webhook_type == "sync":
        handle_sync(webhook)
    elif webhook_type == "forward":
        handle_forward(webhook)
    elif webhook_type == "async_action":
        logger.info("Async action finished for %s", webhook.get("connectionId"))
    else:
        # New types are added without notice, and unattributed forwards arrive
        # as the raw provider payload without a Nango wrapper. Acknowledge them.
        logger.info("Unhandled Nango webhook: %s", webhook_type or "(raw forwarded payload)")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
