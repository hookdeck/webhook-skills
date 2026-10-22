# Generated with: yousign-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Yousign: X-Yousign-Signature-256 = "sha256=" + hex(HMAC-SHA256(secret, raw_body))."""
    if not signature_header or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())


@app.post("/webhooks/yousign")
async def yousign_webhook(request: Request):
    # Raw body is required for signature verification
    raw_body = await request.body()
    signature = request.headers.get("x-yousign-signature-256")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Yousign-Signature-256 header")
    if not verify_signature(raw_body, signature, os.getenv("YOUSIGN_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # event_id is globally unique: use it to deduplicate retries (x-yousign-retry > 0)
    name = event.get("event_name")
    data = event.get("data") or {}
    if name == "signature_request.activated":
        print("Signature request activated:", (data.get("signature_request") or {}).get("id"))
    elif name == "signature_request.done":
        print("Signature request done:", (data.get("signature_request") or {}).get("id"))
    elif name == "signature_request.declined":
        print("Signature request declined:", (data.get("signature_request") or {}).get("id"))
    elif name == "signer.done":
        print("Signer done:", (data.get("signer") or {}).get("id"))
    elif name == "signer.declined":
        print("Signer declined:", (data.get("signer") or {}).get("id"))
    else:
        print("Unhandled event:", name)

    # Respond 2xx within 1 second
    return {"received": True}
