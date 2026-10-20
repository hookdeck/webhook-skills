# Generated with: clickup-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_clickup_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify a ClickUp webhook signature.

    ClickUp sends hex(HMAC-SHA256(webhook.secret, raw_body)) in the X-Signature header.
    """
    if not signature or not secret:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature.lower(), expected_signature)


@app.post("/webhooks/clickup")
async def clickup_webhook(
    request: Request,
    x_signature: str | None = Header(default=None),
):
    # Read the raw body before parsing - the signature covers these exact bytes
    raw_body = await request.body()

    # Return 400, not 401: ClickUp suspends a webhook immediately on a 401 response
    if not x_signature:
        raise HTTPException(status_code=400, detail="Missing X-Signature header")

    # Read the secret per request so it can be rotated without a restart
    if not verify_clickup_webhook(raw_body, x_signature, os.environ.get("CLICKUP_WEBHOOK_SECRET")):
        print("ClickUp webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event")
    webhook_id = payload.get("webhook_id")
    history_items = payload.get("history_items") or []

    # ClickUp recommends {webhook_id}:{history_item_id} as the idempotency key
    idempotency_keys = [f"{webhook_id}:{item.get('id')}" for item in history_items]
    print(f"Received {event} (webhook {webhook_id}) {idempotency_keys}")

    # The event name is in the body; ClickUp sends no event header
    if event == "taskCreated":
        print(f"Task created: {payload.get('task_id')}")
        # TODO: Sync the new task to your system

    elif event == "taskUpdated":
        print(f"Task updated: {payload.get('task_id')}")
        # TODO: Fetch the task from the API or apply history_items changes

    elif event == "taskDeleted":
        print(f"Task deleted: {payload.get('task_id')}")
        # TODO: Remove mirrored records

    elif event == "taskStatusUpdated":
        status_item = next((i for i in history_items if i.get("field") == "status"), {})
        before = (status_item.get("before") or {}).get("status")
        after = (status_item.get("after") or {}).get("status")
        print(f"Task {payload.get('task_id')} status: {before} -> {after}")
        # TODO: Trigger workflow automation

    elif event == "taskAssigneeUpdated":
        print(f"Task assignee updated: {payload.get('task_id')}")
        # TODO: Notify the new assignee

    elif event == "taskCommentPosted":
        print(f"Comment posted on task: {payload.get('task_id')}")
        # TODO: Forward the comment to chat

    elif event in ("listCreated", "listUpdated", "listDeleted"):
        print(f"{event}: List {payload.get('list_id')}")

    elif event in ("goalCreated", "goalUpdated", "goalDeleted"):
        print(f"{event}: Goal {payload.get('goal_id')}")

    elif event in ("keyResultCreated", "keyResultUpdated", "keyResultDeleted"):
        print(f"{event}: Target {payload.get('key_result_id')}")

    else:
        print(f"Unhandled event: {event}")

    # Respond quickly: ClickUp treats responses slower than 7 seconds as failures
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
