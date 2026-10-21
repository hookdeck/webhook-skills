# Generated with: rubrik-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from starlette.datastructures import Headers

load_dotenv()

app = FastAPI(title="Rubrik Webhooks Example")

# ---------------------------------------------------------------------------
# Authentication
#
# RUBRIK SECURITY CLOUD WEBHOOKS ARE NOT SIGNED. There is no HMAC and no
# signature header. The webhook carries a credential chosen with
# `authInfo.authType` (AuthenticationTypeV2):
#
#   CUSTOM_HEADER  -> <headerKey>: <headerValue>        (recommended)
#   BEARER         -> Authorization: Bearer <token>
#   BASIC          -> Authorization: Basic base64(user:pass)
#
# OAUTH2 and URL-token modes are not handled here. With no credentials
# configured every request is rejected (fail closed).
# ---------------------------------------------------------------------------

DEFAULT_HEADER_NAME = "X-Rubrik-Webhook-Token"


def secure_equals(a: str, b: str) -> bool:
    """Constant-time compare via fixed-length SHA-256 digests.

    hmac.compare_digest raises TypeError for non-ASCII str input, so hash the
    UTF-8 bytes first; that also hides the secret's length.
    """
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def _parse_authorization(header: Optional[str]) -> Optional[tuple]:
    if not header:
        return None
    parts = header.strip().split(None, 1)
    if len(parts) != 2:
        return None
    return parts[0].lower(), parts[1].strip()


def _verify_basic(authorization: Optional[str], username: str, password: str) -> bool:
    parsed = _parse_authorization(authorization)
    if not parsed or parsed[0] != "basic":
        return False
    try:
        decoded = base64.b64decode(parsed[1], validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    if ":" not in decoded:
        return False
    # Split on the FIRST colon only: passwords may contain colons.
    user, pw = decoded.split(":", 1)
    user_ok = secure_equals(user, username)
    pass_ok = secure_equals(pw, password)
    return user_ok and pass_ok


def authenticate_request(headers: Mapping[str, str], env: Mapping[str, str] = os.environ) -> Optional[str]:
    """Return the matched auth mode ('custom_header' | 'bearer' | 'basic') or None."""
    if not isinstance(headers, Headers):
        headers = Headers(headers=dict(headers))  # case-insensitive lookups
    secret = env.get("RUBRIK_WEBHOOK_SECRET")
    header_name = env.get("RUBRIK_WEBHOOK_HEADER_NAME") or DEFAULT_HEADER_NAME
    bearer_token = env.get("RUBRIK_WEBHOOK_BEARER_TOKEN")
    username = env.get("RUBRIK_WEBHOOK_USERNAME")
    authorization = headers.get("authorization")

    # CUSTOM_HEADER: compare the whole header value (Starlette headers are case-insensitive).
    if secret:
        value = headers.get(header_name)
        if value is not None and secure_equals(value, secret):
            return "custom_header"

    # BEARER: Authorization: Bearer <token>
    if bearer_token:
        parsed = _parse_authorization(authorization)
        if parsed and parsed[0] == "bearer" and secure_equals(parsed[1], bearer_token):
            return "bearer"

    # BASIC: Authorization: Basic base64(username:password)
    if username and _verify_basic(authorization, username, env.get("RUBRIK_WEBHOOK_PASSWORD") or ""):
        return "basic"

    return None


async def require_rubrik_auth(request: Request) -> str:
    """FastAPI dependency: 401 unless the request carries a configured credential."""
    mode = authenticate_request(request.headers)
    if mode is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return mode


# ---------------------------------------------------------------------------
# Payload handling
#
# The default payload is PagerDuty Common Event Format (PD-CEF):
#   { summary, source, severity, timestamp, class, custom_details: { id, type,
#     objectName, objectType, status, eventName, clusterName, ... } }
# Custom templates can produce any shape, so normalize defensively.
# ---------------------------------------------------------------------------


def normalize_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    details = payload.get("custom_details")
    if not isinstance(details, dict):
        details = payload
    return {
        "id": details.get("id") or payload.get("id"),
        "activity_type": details.get("type") or payload.get("type"),  # "Event"
        "event_class": payload.get("class") or details.get("class"),  # e.g. "Backup"
        "status": details.get("status") or payload.get("status"),  # e.g. "Failure"
        "severity": payload.get("severity") or details.get("severity"),  # e.g. "critical"
        "message": payload.get("summary") or payload.get("message") or details.get("message"),
        "object_name": details.get("objectName"),
        "object_type": details.get("objectType"),
        "event_name": details.get("eventName"),  # e.g. "Snapshot.BackupFailed"
        "cluster_name": details.get("clusterName"),
    }


def handle_event(event: Dict[str, Any]) -> None:
    status = event["status"]
    cls = event["event_class"]
    obj = event["object_name"]
    # Status values come from Rubrik's ActivityStatusEnum.
    if status in ("Failure", "TaskFailure"):
        print(f"[rubrik] FAILED {cls} on {obj}: {event['message']}")
        # TODO: open an incident / page on-call
    elif status in ("Success", "TaskSuccess"):
        print(f"[rubrik] Succeeded {cls} on {obj}")
        # TODO: record successful backup / recovery
    elif status in ("PARTIAL_SUCCESS", "Warning"):
        print(f"[rubrik] Warning {cls} on {obj}: {event['message']}")
    elif status in ("Canceled", "Canceling"):
        print(f"[rubrik] Canceled {cls} on {obj}")
    elif status in ("Running", "Queued", "Info"):
        print(f"[rubrik] {status}: {event['message']}")
    else:
        print(f"[rubrik] Unhandled status {status}: {event['message']}")

    # Anomaly (ransomware) events deserve attention regardless of status.
    if cls == "Anomaly":
        print(f"[rubrik] ANOMALY detected on {obj}: {event['message']}")
        # TODO: alert the security team


@app.post("/webhooks/rubrik")
async def rubrik_webhook(request: Request, _mode: str = Depends(require_rubrik_auth)):
    body = await request.body()
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event = normalize_event(payload)
    try:
        handle_event(event)
    except Exception:
        raise HTTPException(status_code=500, detail="Handler error")

    # Rubrik retries only 3 times (1s, 5s, 10s): respond quickly.
    return {"received": True, "id": event["id"]}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
