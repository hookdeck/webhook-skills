# Generated with: breezy-hr-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Breezy HR Webhook Receiver")


def verify_breezy_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Breezy HR webhook signature.

    X-Hook-Signature is the bare hex HMAC-SHA256 of the raw body. The key is the
    whole whsec_ secret as a UTF-8 string (not Standard Webhooks: no prefix
    stripping, no base64 decoding).
    """
    if not signature or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


async def verified_event(request: Request) -> dict:
    """Dependency: read the raw body, verify the signature, then parse JSON."""
    # Raw body is required: the signature covers the exact bytes Breezy sent
    raw_body = await request.body()
    signature = request.headers.get("x-hook-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Hook-Signature header")

    if not verify_breezy_signature(raw_body, signature, os.environ.get("BREEZY_HR_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")


@app.post("/webhooks/breezy-hr")
async def breezy_webhook(event: dict = Depends(verified_event)):
    # Envelope: {_id, type, object, creation_date}. Deduplicate on _id.
    event_type = event.get("type")
    obj = event.get("object") or {}
    print(f"Received {event_type} event ({event.get('_id')})")

    candidate = obj.get("candidate") or {}
    position = obj.get("position") or {}

    if event_type == "candidateAdded":
        print(f"Candidate added: {candidate.get('name')} to {position.get('name')}")
        # TODO: Sync the candidate, notify the hiring team, etc.
    elif event_type == "candidateStatusUpdated":
        print(
            f"Candidate moved: {candidate.get('name')} "
            f"{(obj.get('stage_was') or {}).get('name')} -> {(obj.get('stage') or {}).get('name')}"
        )
        # TODO: Trigger interview scheduling, background checks, etc.
    elif event_type == "candidateDeleted":
        print(f"Candidate deleted: {candidate.get('_id')}")
        # TODO: Remove candidate data from downstream systems
    elif event_type == "companyPositionAdded":
        print(f"Position added: {position.get('name')}")
    elif event_type == "companyPositionUpdated":
        print(f"Position updated: {position.get('name')}")
    elif event_type == "companyPositionDeleted":
        print(f"Position deleted: {position.get('_id')}")
    elif event_type == "companyPositionStateUpdated":
        print(f"Position state changed: {obj.get('state_was')} -> {obj.get('state_is')}")
    elif event_type in ("companyNotePosted", "companyNoteUpdated", "companyNoteDeleted"):
        print(f"Team note event {event_type}: {obj.get('note_id')}")
    else:
        print(f"Unhandled event type: {event_type}")

    # Any 2xx tells Breezy the delivery succeeded
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
