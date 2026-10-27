# Generated with: taskade-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import re
import hmac
import hashlib
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")


def verify_taskade_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Taskade webhook signature (X-Taskade-Signature: sha256=<hex>)."""
    if not signature_header or not secret:
        return False

    # Accept the value with or without the "sha256=" prefix
    sig = re.sub(r"^sha256=", "", signature_header.strip(), flags=re.IGNORECASE)

    # Validate the format before decoding
    if not SIGNATURE_RE.fullmatch(sig):
        return False

    # HMAC-SHA256 of the raw body only (no timestamp is signed)
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()

    # Timing-safe comparison on bytes
    return hmac.compare_digest(bytes.fromhex(sig), expected)


@app.post("/webhooks/taskade")
async def taskade_webhook(request: Request):
    # Raw bytes: the signature covers exactly what Taskade sent
    raw_body = await request.body()
    signature_header = request.headers.get("x-taskade-signature")

    # Read the secret per request so it can be configured after import
    if not verify_taskade_webhook(raw_body, signature_header, os.environ.get("TASKADE_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The docs don't say where a delivery names its event, so read it from the payload
    event = (payload.get("event") or payload.get("type")) if isinstance(payload, dict) else None

    if event == "task.due":
        print(f"Task due: {payload}")
        # TODO: Send a reminder, escalate, etc.

    elif event == "task.assigned":
        print(f"Task assigned: {payload}")
        # TODO: Notify the assignee

    elif event == "comment.created":
        print(f"Comment created: {payload}")

    elif event == "project.created":
        print(f"Project created: {payload}")

    else:
        print(f"Unhandled event: {event or 'unknown'}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
