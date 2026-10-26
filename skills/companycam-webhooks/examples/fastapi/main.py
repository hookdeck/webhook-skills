# Generated with: companycam-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()


def verify_companycam_signature(raw_body: bytes, signature: str, token: str) -> bool:
    """
    Verify a CompanyCam webhook signature.
    X-CompanyCam-Signature = Base64(HMAC-SHA1(webhook token, raw body)).
    Compared as bytes so a non-ASCII header fails verification instead of raising.
    """
    if not signature or not token:
        return False
    digest = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/companycam")
async def companycam_webhook(request: Request):
    # Read the raw body for signature verification (do not parse JSON first).
    raw_body = await request.body()

    token = os.environ.get("COMPANYCAM_WEBHOOK_TOKEN", "")
    if not token:
        print("COMPANYCAM_WEBHOOK_TOKEN is not set")
        return Response(content="Webhook token not configured", status_code=500)

    signature = request.headers.get("x-companycam-signature")
    if not signature:
        return Response(content="Missing X-CompanyCam-Signature header", status_code=401)

    if not verify_companycam_signature(raw_body, signature, token):
        print("CompanyCam webhook signature verification failed")
        return Response(content="Invalid signature", status_code=401)

    # Parse only after verification. `event_type` carries the event name.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    event_type = event.get("event_type") if isinstance(event, dict) else None
    payload = (event.get("payload") if isinstance(event, dict) else None) or {}
    object_id = payload.get("id") if isinstance(payload, dict) else None

    if event_type == "project.created":
        print(f"Project created: {object_id}")
        # TODO: sync the new project to your CRM / job system

    elif event_type == "project.updated":
        print(f"Project updated: {object_id}")
        # TODO: keep your records in sync

    elif event_type == "photo.created":
        print(f"Photo created: {object_id}")
        # TODO: back up the photo, run tagging, etc.

    elif event_type == "photo.updated":
        print(f"Photo updated: {object_id}")
        # TODO: refresh derived assets

    elif event_type == "comment.created":
        print(f"Comment created: {object_id}")
        # TODO: notify the team

    elif event_type == "document.created":
        print(f"Document created: {object_id}")
        # TODO: sync the document

    elif event_type == "todo_list.completed":
        print(f"Checklist completed: {object_id}")
        # TODO: trigger close-out workflow

    elif event_type == "task.completed":
        print(f"Checklist task completed: {object_id}")
        # TODO: track progress

    else:
        print(f"Unhandled event type: {event_type}")

    # CompanyCam expects exactly HTTP 200; anything else is retried.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
