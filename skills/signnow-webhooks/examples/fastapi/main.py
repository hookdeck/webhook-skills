# Generated with: signnow-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""SignNow webhook receiver.

SIGNNOW WEBHOOK VERIFICATION

SignNow signs a callback only when the event subscription was created with a
`secret_key` (any string up to 300 chars). X-SignNow-Signature is then the
base64 HMAC-SHA256 of the raw request body, keyed with that secret as UTF-8.
There is no timestamp in the signed content.
"""

import base64
import hashlib
import hmac
import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="SignNow Webhook Receiver")


def verify_signnow_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """base64(HMAC-SHA256(secret as UTF-8, raw body)), compared in constant time."""
    if not signature or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("ascii"))


async def verified_signnow_body(request: Request) -> bytes:
    """FastAPI dependency: return the raw body only if the signature is valid."""
    secret = os.environ.get("SIGNNOW_WEBHOOK_SECRET")
    if not secret:
        print("SIGNNOW_WEBHOOK_SECRET is not set - refusing unverified webhooks")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-signnow-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-SignNow-Signature header")

    # Raw bytes, whatever the Content-Type: read before any JSON parsing.
    raw_body = await request.body()
    if not verify_signnow_signature(raw_body, signature, secret):
        print("SignNow webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/signnow")
async def signnow_webhook(raw_body: bytes = Depends(verified_signnow_body)):
    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    meta = payload.get("meta") if isinstance(payload, dict) else None
    event = meta.get("event") if isinstance(meta, dict) else None
    print(f"Verified SignNow webhook: {event or 'unknown'}")

    handle_event(payload)
    return {"received": True}


def handle_event(payload: Any) -> None:
    # meta.event is the event name; content holds the entity ids.
    # TODO: dedupe (e.g. on meta.event + content id + meta.timestamp); SignNow retries failed deliveries.
    meta = (payload.get("meta") if isinstance(payload, dict) else None) or {}
    content = (payload.get("content") if isinstance(payload, dict) else None) or {}
    event = meta.get("event")

    if event == "document.open":
        print(f"Document opened: {content.get('document_id')}")
    elif event == "document.update":
        print(f"Document updated: {content.get('document_id')}")
    elif event == "document.complete":
        print(f"Document complete: {content.get('document_id')} ({content.get('document_name')})")
    elif event == "document.delete":
        print(f"Document deleted: {content.get('document_id')}")
    elif event == "document.fieldinvite.sent":
        print(f"Field invite sent for document {content.get('document_id')}")
    elif event == "document.fieldinvite.signed":
        print(f"Field invite signed for document {content.get('document_id')}")
    elif event == "document.fieldinvite.decline":
        print(f"Field invite declined for document {content.get('document_id')}")
    elif event == "user.document.complete":
        print(f"User {content.get('user_id')}'s document complete: {content.get('document_id')}")
    elif event == "document_group.complete":
        print(f"Document group complete: {content.get('group_id')}")
    elif event == "document_group.invite.signer.complete":
        print(f"Signer {content.get('signer_email')} finished group {content.get('group_id')}")
    else:
        print(f"Unhandled SignNow event: {event}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
