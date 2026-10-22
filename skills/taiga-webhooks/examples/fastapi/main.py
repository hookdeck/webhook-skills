# Generated with: taiga-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_taiga_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify a Taiga webhook signature.

    Taiga sends the bare hex HMAC-SHA1 of the raw body (key = webhook secret key, UTF-8)
    in the X-TAIGA-WEBHOOK-SIGNATURE header.
    """
    if not signature or not secret:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha1,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature.lower().encode(), expected_signature.encode())


@app.post("/webhooks/taiga")
async def taiga_webhook(
    request: Request,
    x_taiga_webhook_signature: str | None = Header(default=None),
):
    # Read the raw body before parsing - the signature covers these exact bytes
    raw_body = await request.body()

    if not x_taiga_webhook_signature:
        raise HTTPException(status_code=400, detail="Missing X-TAIGA-WEBHOOK-SIGNATURE header")

    # Read the secret per request so it can be rotated without a restart
    if not verify_taiga_webhook(
        raw_body, x_taiga_webhook_signature, os.environ.get("TAIGA_WEBHOOK_SECRET")
    ):
        print("Taiga webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Taiga sends no event header: the event is the body's type + action
    event_type = payload.get("type")
    action = payload.get("action")
    data = payload.get("data") or {}
    label = data.get("subject") or data.get("name") or data.get("slug") or data.get("id")
    username = (payload.get("by") or {}).get("username", "unknown")
    print(f"Received {event_type} {action} by {username}")

    event = f"{event_type} {action}"
    if event == "userstory create":
        print(f"User story created: {label}")
        # TODO: Sync the new user story
    elif event == "userstory change":
        print(f"User story changed: {label}")
        # TODO: Inspect payload["change"]["diff"] for the edited fields
    elif event == "userstory delete":
        print(f"User story deleted: {label}")
    elif event == "task create":
        print(f"Task created: {label}")
    elif event == "task change":
        print(f"Task changed: {label}")
    elif event == "task delete":
        print(f"Task deleted: {label}")
    elif event in ("issue create", "issue change", "issue delete"):
        print(f"{event}: {label}")
    elif event in ("epic create", "epic change", "epic delete"):
        print(f"{event}: {label}")
    elif event in ("milestone create", "milestone change", "milestone delete"):
        print(f"{event}: {label}")
    elif event in ("wikipage create", "wikipage change", "wikipage delete"):
        print(f"{event}: {label}")
    elif event == "test test":
        print("Taiga test webhook received")
    else:
        print(f"Unhandled event: {event}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
