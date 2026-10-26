# Generated with: qlik-cloud-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Qlik Cloud Webhook Handler")

# Qlik Cloud's docs don't name the HTTP method, so accept all the usual ones.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

_HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_qlik_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """
    Verify the qlik-signature header: the lowercase hex HMAC-SHA256 of the raw request
    body bytes, keyed with the webhook secret's UTF-8 bytes. No prefix, no timestamp.
    """
    if not secret or not isinstance(signature, str):
        return False  # never accept when unconfigured
    # Validate the format first: exactly 64 hex characters (hex is case-insensitive).
    if not _HEX_64.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest on bytes (str raises on non-ASCII)
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


async def require_qlik_signature(
    request: Request,
    qlik_signature: Optional[str] = Header(None, alias="qlik-signature"),
) -> None:
    """FastAPI dependency: verifies the raw body bytes for every method before the handler runs."""
    secret = os.getenv("QLIK_CLOUD_WEBHOOK_SECRET")

    # Fail closed: without a configured secret there is nothing to check.
    if not secret:
        print("Set QLIK_CLOUD_WEBHOOK_SECRET")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes, exactly as received (empty for GET/DELETE: verified over zero bytes).
    raw_body = await request.body()
    if not verify_qlik_signature(raw_body, qlik_signature, secret):
        raise HTTPException(status_code=401, detail="Invalid or missing qlik-signature")


def _str(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


def handle_qlik_event(payload: Dict[str, Any]) -> None:
    # After verification every field is still untrusted: check types before reading.
    # `type` is the CloudEvents type. Payloads from before the hybrid period (and the
    # legacy fields until December 10, 2026) carry the same value in `eventType`.
    event_type = _str(payload.get("type")) or _str(payload.get("eventType"))
    data = payload.get("data")
    if not isinstance(data, dict):
        data = {}
    attributes = data.get("attributes")
    if not isinstance(attributes, dict):
        attributes = {}
    event_id = _str(data.get("id")) or _str(data.get("appId")) or _str(attributes.get("id"))

    if event_type == "com.qlik.v1.app.created":
        print("App created:", event_id)
        # TODO: register the new app in your catalog
    elif event_type == "com.qlik.v1.app.published":
        print("App published:", event_id)
        # TODO: refresh whatever depends on the published app
    elif event_type == "com.qlik.v1.app.deleted":
        print("App deleted:", event_id)
        # TODO: remove the app from your catalog
    elif event_type in ("com.qlik.v1.app.reload.finished", "com.qlik.v1.reload.finished"):
        outcome = "succeeded" if data.get("succeeded") is True else "not reported as succeeded"
        print("Reload finished:", event_id, outcome)
        # TODO: kick off downstream work if the reload succeeded, alert if it did not
    elif event_type == "com.qlik.v1.user.created":
        print("User created:", event_id)
        # TODO: provision the user in your own system
    elif event_type == "com.qlik.v1.user.deleted":
        print("User deleted:", event_id)
        # TODO: deprovision the user
    elif event_type == "com.qlik.v1.automation.created":
        print("Automation created:", event_id)
        # TODO: track the new automation
    elif event_type == "com.qlik.v1.automation.run.started":
        print("Automation run started:", event_id)
        # TODO: record the run
    elif event_type == "com.qlik.v1.api-key.validation.failed":
        print("API key validation failed")
        # TODO: alert the tenant admin
    else:
        print(f"Unhandled Qlik Cloud event: {event_type}")


@app.api_route(
    "/webhooks/qlik-cloud",
    methods=ALLOWED_METHODS,
    dependencies=[Depends(require_qlik_signature)],
)
async def handle_qlik_webhook(request: Request):
    # The signature was already verified over the raw bytes (Starlette caches the body).
    raw = await request.body()

    # GET and DELETE (and some PUT/PATCH) carry no body: acknowledge them.
    if not raw:
        return {"received": True}

    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_qlik_event(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Qlik Cloud event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
