# Generated with: n8n-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_n8n_request(headers, config=os.environ) -> bool:
    """n8n's HTTP Request node does not sign requests. Authenticate with the
    shared secret from the node's credential:
      - Header auth: <N8N_WEBHOOK_HEADER>: <secret>   (e.g. X-Webhook-Secret)
      - Bearer auth: Authorization: Bearer <secret>
      - Basic auth:  Authorization: Basic base64(user:password)  (optional)
    """
    secret = config.get("N8N_WEBHOOK_SECRET")
    header_name = config.get("N8N_WEBHOOK_HEADER") or "X-Webhook-Secret"
    authorization = headers.get("authorization") or ""

    if secret:
        header_value = headers.get(header_name)
        if header_value and safe_equal(header_value, secret):
            return True

        bearer = re.match(r"^Bearer\s+(.+)$", authorization, re.IGNORECASE)
        if bearer and safe_equal(bearer.group(1).strip(), secret):
            return True

    user = config.get("N8N_BASIC_AUTH_USER")
    password = config.get("N8N_BASIC_AUTH_PASSWORD")
    basic = re.match(r"^Basic\s+(.+)$", authorization, re.IGNORECASE)
    if user and password and basic:
        try:
            decoded = base64.b64decode(basic.group(1).strip()).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return False
        if ":" in decoded:
            req_user, req_password = decoded.split(":", 1)
            # Compare both parts every time (no short-circuit on the username).
            user_ok = safe_equal(req_user, user)
            password_ok = safe_equal(req_password, password)
            if user_ok and password_ok:
                return True

    return False


async def require_n8n_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_n8n_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def handle_event(payload: dict) -> None:
    """n8n has no built-in event types: the payload is whatever your workflow
    sends. These examples assume {"event": "...", "id": "...", "data": {...}}."""
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "lead.created":
        print(f"Lead created: {data.get('email')}")
        # TODO: add the lead to your CRM

    elif event == "order.created":
        print(f"Order created: {data.get('order_id')}")
        # TODO: fulfil the order

    elif event == "workflow.completed":
        print(f"Workflow completed: {data.get('workflow_name')}")
        # TODO: mark the job as done

    elif event == "workflow.failed":
        print(f"Workflow failed: {data.get('workflow_name')} ({data.get('error')})")
        # TODO: alert the owning team

    else:
        print(f"Unhandled event: {event} (id: {payload.get('id')})")


@app.post("/webhooks/n8n", dependencies=[Depends(require_n8n_auth)])
async def n8n_webhook(request: Request):
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling n8n event: {err}")
        # A non-2xx makes the n8n HTTP Request node fail (and retry, if Retry On Fail is on).
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
