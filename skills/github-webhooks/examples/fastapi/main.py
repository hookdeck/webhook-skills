import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

github_secret = os.environ.get("GITHUB_WEBHOOK_SECRET")


def verify_github_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify GitHub webhook signature."""
    if not signature_header:
        return False

    # Extract the signature from the header (format: sha256=<hex>)
    signature = signature_header.replace("sha256=", "")

    # Compute expected signature
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)


@app.post("/webhooks/github")
async def github_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature-256")
    event = request.headers.get("x-github-event")
    delivery_id = request.headers.get("x-github-delivery")

    # Verify webhook signature
    if not verify_github_webhook(raw_body, signature_header, github_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    action = payload.get("action")

    print(f"Received {event} event (delivery: {delivery_id})")

    # Handle the event based on type
    if event == "ping":
        print(f"Ping received: {payload.get('zen')}")

    elif event == "push":
        head_commit = payload.get("head_commit", {})
        print(f"Push to {payload['ref']}: {head_commit.get('message')}")
        # TODO: Trigger CI/CD, run tests, deploy, etc.

    elif event == "pull_request":
        pr = payload["pull_request"]
        print(f"PR #{payload['number']} {action}: {pr['title']}")
        # TODO: Run checks, notify reviewers, auto-merge, etc.

    elif event == "issues":
        issue = payload["issue"]
        print(f"Issue #{issue['number']} {action}: {issue['title']}")
        # TODO: Triage, label, notify, etc.

    elif event == "issue_comment":
        issue = payload["issue"]
        comment = payload["comment"]
        print(f"Comment on #{issue['number']} by {comment['user']['login']}")
        # TODO: Bot responses, command parsing, etc.

    elif event == "release":
        release = payload["release"]
        print(f"Release {action}: {release['tag_name']}")
        # TODO: Deploy, notify, update changelog, etc.

    elif event == "workflow_run":
        workflow_run = payload["workflow_run"]
        print(f"Workflow \"{workflow_run['name']}\" {workflow_run['conclusion']}")
        # TODO: Post-CI automation, notifications, etc.

    else:
        print(f"Unhandled event: {event}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
