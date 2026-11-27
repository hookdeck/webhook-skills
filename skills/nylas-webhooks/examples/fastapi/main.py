# Generated with: nylas-webhooks skill
# https://github.com/hookdeck/webhook-skills
import gzip
import hashlib
import hmac
import json
import os
import re

from fastapi import FastAPI, Request, Response
from fastapi.responses import PlainTextResponse

app = FastAPI()


def verify_nylas_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Nylas webhook signature.

    Nylas signs the RAW request body with HMAC-SHA256 keyed on the
    per-destination webhook_secret and sends the hex digest in the
    ``x-nylas-signature`` header. Only the body is signed (this is NOT
    Standard Webhooks). When Content-Encoding is gzip, the signature covers
    the COMPRESSED bytes, so verify before decompressing.
    """
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)


# --- Challenge handshake (endpoint verification) ---------------------------
# When the webhook is created, Nylas GETs this URL with ?challenge=<value>.
# Echo the exact value back as plain text with 200 within 20 seconds.
@app.get("/webhooks/nylas")
async def nylas_challenge(challenge: str = "") -> PlainTextResponse:
    return PlainTextResponse(content=challenge, status_code=200)


# --- Notification handler --------------------------------------------------
@app.post("/webhooks/nylas")
async def nylas_webhook(request: Request) -> Response:
    # Read the exact bytes Nylas signed, before parsing.
    raw_body = await request.body()
    # Header lookup is case-insensitive in Starlette.
    signature = request.headers.get("x-nylas-signature")

    if not verify_nylas_signature(raw_body, signature, os.environ.get("NYLAS_WEBHOOK_SECRET")):
        print("Nylas webhook signature verification failed")
        return PlainTextResponse("Invalid signature", status_code=401)

    # Signature valid — decompress (if needed) and parse.
    try:
        body = gzip.decompress(raw_body) if request.headers.get("content-encoding") == "gzip" else raw_body
        event = json.loads(body)
    except (OSError, ValueError):
        return PlainTextResponse("Invalid payload", status_code=400)

    # Nylas payloads follow CloudEvents 1.0: trigger in `type`, resource in `data.object`.
    # `type` can carry suffixes you didn't subscribe to: `.truncated` (body
    # removed, fetch the message by ID) and `.transformed` (customized fields).
    trigger = re.sub(r"(\.(?:truncated|transformed))+$", "", str(event.get("type")))
    data = event.get("data") or {}
    obj = data.get("object") or {}
    # Some types put grant_id in `data`, most in `data.object`.
    grant_id = data.get("grant_id") or obj.get("grant_id")
    print(f"Received {trigger} (id: {event.get('id')}, grant: {grant_id})")

    if trigger == "message.created":
        print("New message:", obj.get("subject"))
        # Your code: parse the email, run automation, notify, etc.
    elif trigger == "message.updated":
        print("Message updated:", obj.get("id"))
    elif trigger == "message.opened":
        print("Tracked message opened:", obj.get("message_id") or obj.get("id"))
    elif trigger == "message.link_clicked":
        print("Tracked link clicked:", obj.get("id"))
    elif trigger == "message.bounce_detected":
        print("Message bounced:", obj.get("id"))
    elif trigger == "event.created":
        print("Calendar event created:", obj.get("title") or obj.get("id"))
    elif trigger == "event.updated":
        print("Calendar event updated:", obj.get("id"))
    elif trigger == "event.deleted":
        print("Calendar event deleted:", obj.get("id"))
    elif trigger == "grant.created":
        print("Grant created (account connected):", grant_id)
    elif trigger == "grant.expired":
        print("Grant expired — re-auth required:", grant_id)
    elif trigger == "grant.deleted":
        print("Grant deleted (account disconnected):", grant_id)
    else:
        print(f"Unhandled trigger: {trigger}")

    # Acknowledge quickly. Do heavy work asynchronously.
    return PlainTextResponse("OK", status_code=200)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
