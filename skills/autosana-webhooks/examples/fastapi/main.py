# Generated with: autosana-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

PREFIX = "sha256="


def verify_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Autosana: X-Autosana-Signature-256 = "sha256=" + hex(HMAC-SHA256(secret, raw_body))."""
    if not signature_header or not secret or not signature_header.startswith(PREFIX):
        return False
    received = signature_header[len(PREFIX):].lower()
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Encode both sides to bytes so a non-ASCII header fails verification instead of raising
    return hmac.compare_digest(received.encode("utf-8"), computed.encode("utf-8"))


@app.post("/webhooks/autosana")
async def autosana_webhook(request: Request):
    # Raw body is required for signature verification
    raw_body = await request.body()
    signature = request.headers.get("x-autosana-signature-256")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Autosana-Signature-256 header")
    if not verify_signature(raw_body, signature, os.getenv("AUTOSANA_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is in the body (`event`); there is no event header
    event = payload.get("event") if isinstance(payload, dict) else None
    if event == "batch.completed":
        summary = payload.get("summary") or {}
        app_name = (payload.get("app") or {}).get("name")
        print(
            f"Batch completed for {app_name}: {summary.get('passed_groups')}/"
            f"{summary.get('total_groups')} groups passed, {summary.get('failed_groups')} failed"
        )
        for group in payload.get("run_groups") or []:
            print(f"  {group.get('name')}: {group.get('status')} ({group.get('url')})")
    else:
        print("Unhandled event:", event)

    return {"received": True}
