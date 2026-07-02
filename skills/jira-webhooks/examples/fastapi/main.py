# Generated with: jira-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

jira_secret = os.environ.get("JIRA_WEBHOOK_SECRET")


def verify_jira_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify Jira webhook signature.

    Jira Cloud signs the raw body with HMAC-SHA256 keyed on the webhook secret
    and sends it in the X-Hub-Signature header as `sha256=<hex>` (WebSub format).
    """
    # Split the WebSub `method=signature` header (e.g. `sha256=<hex>`)
    method, _, sig = (signature_header or "").partition("=")
    if method != "sha256" or not sig:
        return False

    # Compute the expected signature over the raw body
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(sig, expected_signature)


@app.post("/webhooks/jira")
async def jira_webhook(request: Request):
    # Get the raw body for signature verification (do not parse before verifying)
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature")
    delivery_id = request.headers.get("x-atlassian-webhook-identifier")

    # Verify webhook signature before doing anything else
    if not verify_jira_webhook(raw_body, signature_header, jira_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification. Jira has no event-type header —
    # the event name is in the `webhookEvent` field of the body.
    payload = json.loads(raw_body)
    event = payload.get("webhookEvent")
    issue = payload.get("issue", {})

    print(f"Received {event} event (delivery: {delivery_id})")

    # Handle the event based on its `webhookEvent` type
    if event == "jira:issue_created":
        print(f"Issue created {issue.get('key')}: {issue.get('fields', {}).get('summary')}")
        # TODO: Sync to external system, auto-assign, notify, etc.

    elif event == "jira:issue_updated":
        changelog = payload.get("changelog", {})
        print(f"Issue updated {issue.get('key')}: {changelog.get('items')}")
        # TODO: Track status changes, trigger automations, etc.

    elif event == "jira:issue_deleted":
        print(f"Issue deleted {issue.get('key')}")
        # TODO: Clean up mirrored records, etc.

    elif event == "comment_created":
        comment = payload.get("comment", {})
        author = comment.get("author", {}).get("displayName")
        print(f"Comment on {issue.get('key')} by {author}")
        # TODO: ChatOps, notifications, command parsing, etc.

    elif event == "comment_updated":
        print(f"Comment updated on {issue.get('key')}")
        # TODO: Audit trails, re-processing, etc.

    elif event == "comment_deleted":
        print(f"Comment deleted on {issue.get('key')}")
        # TODO: Audit trails, etc.

    elif event == "worklog_created":
        print(f"Worklog logged on {issue.get('key')}")
        # TODO: Time-tracking, billing integrations, etc.

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
