# Generated with: linear-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Linear's recommended replay-protection window for `webhookTimestamp`.
WEBHOOK_TIMESTAMP_TOLERANCE_MS = 60 * 1000


def _get_secret() -> str:
    """Read the signing secret each request so tests can override the env var."""
    return os.environ.get("LINEAR_WEBHOOK_SECRET", "")


def verify_linear_webhook(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a Linear webhook signature.

    Linear signs every webhook using HMAC-SHA256 over the raw request body and
    sends the hex-encoded digest in the ``Linear-Signature`` header. The
    header value is a bare hex string — Linear does **not** prefix it with
    ``sha256=``.
    """
    if not signature_header or not secret:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature_header, expected_signature)


def is_fresh_timestamp(webhook_timestamp_ms, now_ms: int | None = None) -> bool:
    """Return True if ``webhook_timestamp_ms`` is within 1 minute of now.

    Linear's ``webhookTimestamp`` field is UNIX **milliseconds** since epoch.
    """
    if not isinstance(webhook_timestamp_ms, int) or isinstance(webhook_timestamp_ms, bool):
        return False
    if now_ms is None:
        now_ms = int(time.time() * 1000)
    return abs(now_ms - webhook_timestamp_ms) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS


@app.post("/webhooks/linear")
async def linear_webhook(request: Request):
    # Read the raw body — `await request.json()` would parse the body, which
    # changes the byte representation and breaks signature verification.
    raw_body = await request.body()
    signature_header = request.headers.get("linear-signature")
    event = request.headers.get("linear-event")
    delivery_id = request.headers.get("linear-delivery")

    # 1. Verify the signature.
    if not verify_linear_webhook(raw_body, signature_header, _get_secret()):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 2. Parse the payload only after verifying.
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    # 3. Reject stale deliveries.
    if not is_fresh_timestamp(payload.get("webhookTimestamp")):
        raise HTTPException(status_code=400, detail="Stale webhook")

    action = payload.get("action")
    print(f"Received Linear {event} {action} (delivery: {delivery_id})")

    data = payload.get("data") or {}

    # 4. Route by Linear-Event header.
    if event == "Issue":
        print(f"Issue {action}: {data.get('title')}")
        # TODO: sync to external tracker, notify Slack, etc.

    elif event == "Comment":
        print(f"Comment {action} on issue {data.get('issueId')}")
        # TODO: mirror discussion, bot replies, etc.

    elif event == "IssueLabel":
        print(f"Label {action}: {data.get('name')}")
        # TODO: tag-based routing, analytics, etc.

    elif event == "Project":
        print(f"Project {action}: {data.get('name')}")
        # TODO: roadmap dashboard sync, etc.

    elif event == "ProjectUpdate":
        print(f"Project update {action} on project {data.get('projectId')}")

    elif event == "Cycle":
        print(f"Cycle {action}: {data.get('name') or data.get('number')}")

    elif event == "Reaction":
        print(f"Reaction {action} ({data.get('emoji')})")

    elif event == "IssueSLA":
        issue_data = payload.get("issueData") or {}
        print(f"SLA event on issue {issue_data.get('id')}")

    elif event == "OAuthAppRevoked":
        print(f"OAuth app revoked: {payload.get('oauthClientId')}")

    else:
        print(f"Unhandled Linear event: {event}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
