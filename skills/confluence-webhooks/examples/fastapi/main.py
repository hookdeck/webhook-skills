# Generated with: confluence-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """X-Hub-Signature: HMAC-SHA256 hex digest of the raw body, as "sha256=<hex>" (prefix optional)."""
    if not signature_header or not secret:
        return False
    sig = signature_header.strip().lower()
    algo, sep, rest = sig.partition("=")
    if sep:
        if algo != "sha256":
            return False
        sig = rest
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig.encode(), expected.encode())


@app.post("/webhooks/confluence")
async def confluence_webhook(request: Request):
    secret = os.getenv("CONFLUENCE_WEBHOOK_SECRET")
    if not secret:
        return PlainTextResponse("CONFLUENCE_WEBHOOK_SECRET is not set", status_code=500)

    signature = request.headers.get("x-hub-signature")
    if not signature:
        return PlainTextResponse("Missing X-Hub-Signature header", status_code=400)

    # Raw bytes: the signature covers the exact body sent, whatever the content type.
    raw_body = await request.body()
    if not verify_signature(raw_body, signature, secret):
        return PlainTextResponse("Invalid signature", status_code=400)

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    # The event name is in the body's "event" field.
    event = payload.get("event") if isinstance(payload, dict) else None
    if event == "page_created":
        print("Page created:", (payload.get("page") or {}).get("id"))
    elif event == "page_updated":
        print("Page updated:", (payload.get("page") or {}).get("id"))
    elif event == "page_removed":
        print("Page removed (trashed):", (payload.get("page") or {}).get("id"))
    elif event == "blog_created":
        print("Blog post created:", (payload.get("blog") or {}).get("id"))
    elif event == "comment_created":
        print("Comment created:", (payload.get("comment") or {}).get("id"))
    elif event == "space_created":
        print("Space created:", (payload.get("space") or {}).get("key"))
    else:
        print("Unhandled event:", event)

    return JSONResponse({"received": True})
