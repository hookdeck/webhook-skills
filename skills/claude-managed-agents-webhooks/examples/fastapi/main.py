# Generated with: claude-managed-agents-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
import hashlib
import json
import base64
import time
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Header

load_dotenv()

app = FastAPI(title="Claude Managed Agents Webhook Handler")


def verify_claude_signature(
    payload: bytes,
    webhook_id: Optional[str],
    webhook_timestamp: Optional[str],
    webhook_signature: Optional[str],
    secret: str,
) -> bool:
    """
    Verify Anthropic Claude Managed Agents webhook signature (Standard Webhooks).

    Signed content: "{webhook-id}.{webhook-timestamp}.{rawBody}"
    Algorithm: HMAC-SHA256, base64-encoded, with the whsec_-prefixed secret
    base64-decoded as the HMAC key.

    Args:
        payload: Raw request body bytes
        webhook_id: Value of webhook-id header
        webhook_timestamp: Value of webhook-timestamp header
        webhook_signature: Value of webhook-signature header
        secret: The whsec_-prefixed signing key

    Returns:
        True if any signature in the header matches the expected one.
    """
    if not webhook_id or not webhook_timestamp or not webhook_signature or ',' not in webhook_signature:
        return False

    # Reject payloads older than 5 minutes to prevent replay attacks
    try:
        timestamp_diff = int(time.time()) - int(webhook_timestamp)
    except ValueError:
        return False
    if timestamp_diff > 300 or timestamp_diff < -300:
        return False

    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"

    # whsec_ prefix wraps a base64-encoded 32-byte key
    secret_key = secret[6:] if secret.startswith('whsec_') else secret
    try:
        secret_bytes = base64.b64decode(secret_key)
    except Exception:
        return False

    expected_signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8')

    # The header may carry multiple space-separated "v1,<sig>" pairs (rotation)
    for pair in webhook_signature.split(' '):
        parts = pair.split(',', 1)
        if len(parts) != 2:
            continue
        version, signature = parts
        if version == 'v1' and hmac.compare_digest(signature, expected_signature):
            return True
    return False


@app.post("/webhooks/claude-managed-agents")
async def claude_webhook(
    request: Request,
    webhook_id: Optional[str] = Header(None, alias="webhook-id"),
    webhook_timestamp: Optional[str] = Header(None, alias="webhook-timestamp"),
    webhook_signature: Optional[str] = Header(None, alias="webhook-signature"),
):
    """
    Receive and process Anthropic Claude Managed Agents webhooks.
    """
    payload = await request.body()
    secret = os.environ.get("ANTHROPIC_WEBHOOK_SIGNING_KEY")

    if not secret:
        print("ERROR: ANTHROPIC_WEBHOOK_SIGNING_KEY is not set")
        raise HTTPException(status_code=500, detail="Webhook signing key not configured")

    if not verify_claude_signature(payload, webhook_id, webhook_timestamp, webhook_signature, secret):
        print("ERROR: Claude Managed Agents webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(payload.decode('utf-8'))
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # CMA payloads carry the event type under data.type; the top-level
    # event.type is always "event". Switch on event.data.type.
    event_data = event.get("data") or {}
    event_type = event_data.get("type")
    resource_id = event_data.get("id")

    if event_type == "session.status_run_started":
        print(f"Session run started: {resource_id}")

    elif event_type == "session.status_idled":
        print(f"Session idled (awaiting input): {resource_id}")
        # TODO: client.beta.sessions.retrieve(resource_id) and notify user

    elif event_type == "session.status_rescheduled":
        print(f"Session rescheduled (transient error, auto-retrying): {resource_id}")

    elif event_type == "session.status_terminated":
        print(f"Session terminated: {resource_id}")
        # TODO: alert on-call, persist final state

    elif event_type == "session.thread_created":
        print(f"Multiagent thread created: {resource_id}")

    elif event_type == "session.thread_idled":
        print(f"Multiagent thread idled: {resource_id}")

    elif event_type == "session.thread_terminated":
        print(f"Multiagent thread terminated: {resource_id}")

    elif event_type == "session.outcome_evaluation_ended":
        print(f"Outcome evaluation ended for session: {resource_id}")

    elif event_type == "vault.created":
        print(f"Vault created: {resource_id}")

    elif event_type == "vault.archived":
        print(f"Vault archived: {resource_id}")

    elif event_type == "vault.deleted":
        print(f"Vault deleted: {resource_id}")

    elif event_type == "vault_credential.created":
        print(f"Vault credential created: {resource_id}")

    elif event_type == "vault_credential.archived":
        print(f"Vault credential archived: {resource_id}")

    elif event_type == "vault_credential.deleted":
        print(f"Vault credential deleted: {resource_id}")

    elif event_type == "vault_credential.refresh_failed":
        print(f"Vault credential refresh failed: {resource_id}")
        # TODO: trigger OAuth re-consent flow for the user

    else:
        print(f"Unhandled event type: {event_type}")

    # Anything other than 2xx triggers a retry; 3xx counts as failure.
    return {"received": True}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
