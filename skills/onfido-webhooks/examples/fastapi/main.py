# Generated with: onfido-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_onfido_signature(raw_body: bytes, signature: Optional[str], token: Optional[str]) -> bool:
    """Verify X-SHA2-Signature: HMAC-SHA256 hex of the raw body, keyed with the webhook token."""
    if not signature or not token:
        return False
    expected = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Constant-time compare; hex digits are case-insensitive
    return hmac.compare_digest(signature.lower(), expected)


@app.post("/webhooks/onfido")
async def onfido_webhook(request: Request, x_sha2_signature: Optional[str] = Header(None)):
    # Raw body is required: parsed JSON may be reordered and break the signature
    raw_body = await request.body()

    if not verify_onfido_signature(raw_body, x_sha2_signature, os.getenv("ONFIDO_WEBHOOK_TOKEN")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    payload = event.get("payload") or {}
    resource_type = payload.get("resource_type")
    action = payload.get("action")
    obj = payload.get("object") or {}

    if action == "check.started":
        print(f"Check started: {obj.get('id')}")
    elif action == "check.completed":
        print(f"Check completed: {obj.get('id')} ({obj.get('status')})")
    elif action == "report.completed":
        print(f"Report completed: {obj.get('id')} ({obj.get('status')})")
    elif action == "workflow_task.started":
        print(f"Workflow task started: {obj.get('id')}")
    elif action == "workflow_task.completed":
        print(f"Workflow task completed: {obj.get('id')}")
    elif action == "workflow_run.completed":
        print(f"Workflow run completed: {obj.get('id')} ({obj.get('status')})")
    else:
        print(f"Unhandled Onfido event: {resource_type} / {action}")

    # Respond 2xx within 10 seconds or Onfido retries
    return {"received": True}
