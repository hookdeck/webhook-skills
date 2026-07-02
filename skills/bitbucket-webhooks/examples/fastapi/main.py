# Generated with: bitbucket-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

bitbucket_secret = os.environ.get("BITBUCKET_WEBHOOK_SECRET")


def verify_bitbucket_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify Bitbucket webhook signature.

    Header format: sha256=<hex>. HMAC-SHA256 hex over the raw body.
    """
    if not signature_header:
        return False

    # Partition on "=" to separate method and signature.
    algo, _, signature = signature_header.partition("=")
    if algo != "sha256" or not signature:
        return False

    # Compute expected signature over the raw body
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)


@app.post("/webhooks/bitbucket")
async def bitbucket_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature")
    event = request.headers.get("x-event-key")
    request_uuid = request.headers.get("x-request-uuid")

    # Verify webhook signature
    if not verify_bitbucket_webhook(raw_body, signature_header, bitbucket_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)

    print(f"Received {event} event (uuid: {request_uuid})")

    # Handle the event based on the X-Event-Key
    if event == "repo:push":
        changes = payload.get("push", {}).get("changes", [])
        change = changes[0] if changes else {}
        name = (change.get("new") or change.get("old") or {}).get("name")
        commits = change.get("commits", [])
        message = commits[0].get("message") if commits else None
        print(f"Push to {name}: {message}")
        # TODO: Trigger CI/CD, run tests, deploy, etc.

    elif event == "pullrequest:created":
        pr = payload["pullrequest"]
        print(f"PR #{pr['id']} created: {pr['title']}")
        # TODO: Assign reviewers, run checks, etc.

    elif event == "pullrequest:updated":
        pr = payload["pullrequest"]
        print(f"PR #{pr['id']} updated: {pr['title']}")
        # TODO: Re-run checks, notify reviewers, etc.

    elif event == "pullrequest:approved":
        pr = payload["pullrequest"]
        approval = payload.get("approval", {})
        user = approval.get("user", {})
        print(f"PR #{pr['id']} approved by {user.get('display_name')}")
        # TODO: Merge gating, notifications, etc.

    elif event == "pullrequest:fulfilled":
        pr = payload["pullrequest"]
        print(f"PR #{pr['id']} merged: {pr['title']}")
        # TODO: Deploy, notify, close linked issues, etc.

    elif event == "pullrequest:rejected":
        pr = payload["pullrequest"]
        print(f"PR #{pr['id']} declined: {pr['title']}")
        # TODO: Cleanup, notify author, etc.

    elif event == "pullrequest:comment_created":
        pr = payload["pullrequest"]
        comment = payload.get("comment", {}).get("content", {}).get("raw")
        print(f"Comment on PR #{pr['id']}: {comment}")
        # TODO: Bot responses, command parsing, etc.

    elif event == "issue:created":
        issue = payload["issue"]
        print(f"Issue #{issue['id']} created: {issue['title']}")
        # TODO: Triage, label, notify, etc.

    else:
        print(f"Unhandled event: {event}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
