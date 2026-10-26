# Generated with: teamwork-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_teamwork_webhook(raw_body: bytes, signature: str | None, token: str | None) -> bool:
    """Verify a Teamwork (Projects, Version 2) webhook signature.

    Teamwork sends hex(HMAC-SHA256(token, raw_body)) in the X-Projects-Signature header.
    """
    if not signature or not token:
        return False

    expected_signature = hmac.new(
        token.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison on bytes: compare_digest raises TypeError for non-ASCII str,
    # which would turn a bad header into a 500 instead of a 401
    return hmac.compare_digest(
        signature.lower().encode("utf-8"),
        expected_signature.encode("utf-8"),
    )


@app.post("/webhooks/teamwork")
async def teamwork_webhook(
    request: Request,
    x_projects_signature: str | None = Header(default=None),
    x_projects_event: str | None = Header(default=None),
):
    # Read the raw body before parsing - the signature covers these exact bytes
    raw_body = await request.body()

    if not x_projects_signature:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Projects-Signature header (use a Version 2 webhook with a token)",
        )

    # Read the token per request so it can be rotated without a restart
    if not verify_teamwork_webhook(raw_body, x_projects_signature, os.environ.get("TEAMWORK_WEBHOOK_TOKEN")):
        print("Teamwork webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # The event name is in the X-Projects-Event header, e.g. TASK.CREATED
    event = x_projects_event
    creator = payload.get("eventCreator") or {}
    print(f"Received {event} from user {creator.get('id')}")

    def entity_id(key: str):
        value = payload.get(key)
        return value.get("id") if isinstance(value, dict) else None

    if event == "TASK.CREATED":
        print(f"Task created: {entity_id('task')}")
        # TODO: Sync the new task to your system
    elif event == "TASK.UPDATED":
        print(f"Task updated: {entity_id('task')}")
        # TODO: Apply the changes to your mirrored task
    elif event == "TASK.COMPLETED":
        print(f"Task completed: {entity_id('task')}")
        # TODO: Trigger downstream automation
    elif event == "TASK.DELETED":
        # All delete events share the payload { id, projectId, eventCreator }
        print(f"Task deleted: {payload.get('id')}")
        # TODO: Remove mirrored records
    elif event == "PROJECT.CREATED":
        print(f"Project created: {entity_id('project')}")
        # TODO: Provision resources for the project
    elif event == "COMMENT.CREATED":
        print(f"Comment created: {entity_id('comment')}")
        # TODO: Forward the comment to chat
    elif event == "MILESTONE.COMPLETED":
        print(f"Milestone completed: {entity_id('milestone')}")
    elif event == "TIME.CREATED":
        print(f"Time logged: {entity_id('time')}")
    else:
        print(f"Unhandled event: {event}")

    # Respond quickly: Teamwork requires a 200 within 5 seconds
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
