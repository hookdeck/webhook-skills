import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

_SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")


def verify_forgejo_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify Forgejo webhook signature (X-Forgejo-Signature: bare hex HMAC-SHA256 of the raw body)."""
    # Forgejo sends the header with an empty value when no secret is configured
    if not secret or not signature or not _SIGNATURE_RE.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()

    # Format is validated above; compare bytes in constant time
    return hmac.compare_digest(bytes.fromhex(signature), expected)


@app.post("/webhooks/forgejo")
async def forgejo_webhook(request: Request):
    # Raw bytes for signature verification (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-forgejo-signature")
    # X-Forgejo-Event-Type is the exact event type; X-Forgejo-Event is the coarser group
    event = request.headers.get("x-forgejo-event-type") or request.headers.get("x-forgejo-event")
    delivery_id = request.headers.get("x-forgejo-delivery")

    if not verify_forgejo_webhook(raw_body, signature, os.environ.get("FORGEJO_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    action = payload.get("action")

    print(f"Received {event} event (delivery: {delivery_id})")

    if event == "push":
        commits = payload.get("commits") or [{}]
        pusher = payload.get("pusher") or {}
        print(f"Push to {payload.get('ref')} by {pusher.get('login')}: {commits[0].get('message')}")
        # TODO: Trigger CI/CD, run tests, deploy, etc.

    elif event == "pull_request":
        pr = payload.get("pull_request") or {}
        print(f"PR #{payload.get('number')} {action}: {pr.get('title')}")
        # TODO: Run checks, notify reviewers, etc.

    elif event == "issues":
        issue = payload.get("issue") or {}
        print(f"Issue #{issue.get('number')} {action}: {issue.get('title')}")
        # TODO: Triage, label, notify, etc.

    elif event in ("issue_comment", "pull_request_comment"):
        issue = payload.get("issue") or {}
        comment = payload.get("comment") or {}
        print(f"Comment on #{issue.get('number')} by {(comment.get('user') or {}).get('login')}")
        # TODO: Bot commands, notifications, etc.

    elif event == "create":
        print(f"Created {payload.get('ref_type')}: {payload.get('ref')}")
        # TODO: Environment setup, etc.

    elif event == "delete":
        print(f"Deleted {payload.get('ref_type')}: {payload.get('ref')}")
        # TODO: Cleanup, archive, etc.

    elif event == "release":
        release = payload.get("release") or {}
        print(f"Release {action}: {release.get('tag_name')}")
        # TODO: Deploy, notify, update changelog, etc.

    else:
        print(f"Unhandled event: {event}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
