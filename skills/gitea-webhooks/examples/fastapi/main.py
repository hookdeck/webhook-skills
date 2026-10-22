import os
import hmac
import hashlib
import json
from urllib.parse import parse_qs
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_gitea_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify Gitea webhook signature (X-Gitea-Signature: bare hex HMAC-SHA256)."""
    # Gitea sends the header with an empty value when no secret is configured
    if not signature or not secret:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature, expected)


def parse_payload(raw_body: bytes, content_type: str) -> dict:
    """Parse after verification: JSON, or form-encoded with JSON in `payload`."""
    text = raw_body.decode("utf-8")
    if "application/x-www-form-urlencoded" in content_type:
        text = parse_qs(text)["payload"][0]
    return json.loads(text)


@app.post("/webhooks/gitea")
async def gitea_webhook(request: Request):
    # Raw body for signature verification (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-gitea-signature")
    event = request.headers.get("x-gitea-event")
    delivery_id = request.headers.get("x-gitea-delivery")

    if not verify_gitea_webhook(raw_body, signature, os.environ.get("GITEA_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = parse_payload(raw_body, request.headers.get("content-type", ""))
    except (ValueError, KeyError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid payload")
    action = payload.get("action")

    print(f"Received {event} event (delivery: {delivery_id})")

    if event == "push":
        head_commit = payload.get("head_commit") or {}
        print(f"Push to {payload.get('ref')}: {head_commit.get('message')}")
        # TODO: Trigger CI/CD, run tests, deploy, etc.

    elif event == "pull_request":
        pr = payload.get("pull_request") or {}
        print(f"PR #{payload.get('number')} {action}: {pr.get('title')}")
        # TODO: Run checks, notify reviewers, etc.

    elif event == "issues":
        issue = payload.get("issue") or {}
        print(f"Issue #{issue.get('number')} {action}: {issue.get('title')}")
        # TODO: Triage, label, notify, etc.

    elif event == "issue_comment":
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
