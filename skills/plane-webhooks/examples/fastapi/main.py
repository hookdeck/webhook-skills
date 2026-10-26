import os
import re
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

# X-Plane-Signature is exactly 64 hex characters (HMAC-SHA256), no prefix
SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{64}", re.ASCII)

# Plane's docs show one work item example whose `event` holds an enum label
# instead of `workitem.updated`
EVENT_ALIASES = {
    "WebhookScope.ScopeChoices.WORK_ITEM_UPDATED": "workitem.updated",
}


def verify_plane_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify Plane webhook signature (X-Plane-Signature: bare hex HMAC-SHA256 of the raw body)."""
    if not signature or not secret or not SIGNATURE_PATTERN.fullmatch(signature):
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Hex is case-insensitive; compare bytes, in constant time
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


def as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def as_str(value) -> str | None:
    return value if isinstance(value, str) else None


@app.post("/webhooks/plane")
async def plane_webhook(request: Request):
    secret = os.environ.get("PLANE_WEBHOOK_SECRET")
    if not secret:
        print("PLANE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes for signature verification (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-plane-signature")

    if not verify_plane_webhook(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification, then treat every field as untrusted
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict) or not isinstance(payload.get("event"), str):
        raise HTTPException(status_code=400, detail="Invalid payload")

    event = EVENT_ALIASES.get(payload["event"], payload["event"])
    data = as_dict(payload.get("data"))
    name = as_str(data.get("name"))

    # event_id is stable across retries; delivery_id changes on every attempt
    print(f"Received {event} event (event_id: {payload.get('event_id')}, delivery: {payload.get('delivery_id')})")

    if event == "workitem.created":
        print(f"Work item created: {name}")
        # TODO: Sync to your tracker, notify a channel, etc.

    elif event == "workitem.updated":
        changed = list(as_dict(payload.get("previous_attributes")))
        print(f"Work item updated: {name} (changed: {', '.join(changed) or 'none'})")
        # TODO: React to state or assignee changes, etc.

    elif event == "workitem.deleted":
        print(f"Work item deleted: {payload.get('entity_id')}")
        # TODO: Remove the work item from your own records

    elif event == "workitem.comment.created":
        comment = as_dict(data.get("comment"))
        print(f'Comment on "{name}": {as_str(comment.get("comment_stripped"))}')
        # TODO: Bot commands, notifications, etc.

    elif event == "project.updated":
        print(f"Project updated: {name}")
        # TODO: Refresh cached project details

    elif event == "cycle.created":
        print(f"Cycle created: {name}")
        # TODO: Announce the new cycle, etc.

    else:
        print(f"Unhandled event: {event}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
