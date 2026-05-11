# Generated with: mailgun-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # dotenv is optional in production
    pass

app = FastAPI(title="Mailgun Webhook Handler")


def verify_mailgun(signature: Dict[str, Any], signing_key: str) -> bool:
    """Verify a Mailgun `signature` object.

    The signed content is the raw concatenation `timestamp + token` (no
    separator), hashed with HMAC-SHA256 and hex-encoded. Compare with the
    `signature` field using a timing-safe comparison.
    """
    if not signature or not signing_key:
        return False

    timestamp = signature.get("timestamp")
    token = signature.get("token")
    provided = signature.get("signature")

    if not (timestamp and token and provided):
        return False

    expected = hmac.new(
        signing_key.encode(),
        (str(timestamp) + str(token)).encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, provided)


def verify_parent_signature(
    signature: Dict[str, Any], parent_signing_key: str
) -> bool:
    """Verify the optional `parent-signature` field for subaccount webhooks.

    Returns True when no parent-signature is present (nothing to verify).
    """
    parent_sig = signature.get("parent-signature")
    if not parent_sig:
        return True

    timestamp = signature.get("timestamp", "")
    token = signature.get("token", "")

    expected = hmac.new(
        parent_signing_key.encode(),
        (str(timestamp) + str(token)).encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, parent_sig)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/mailgun")
async def handle_mailgun_webhook(request: Request):
    signing_key = os.getenv("MAILGUN_WEBHOOK_SIGNING_KEY")
    if not signing_key:
        raise HTTPException(
            status_code=500, detail="Webhook verification not configured"
        )

    body_bytes = await request.body()
    try:
        payload = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    signature: Optional[Dict[str, Any]] = payload.get("signature")
    if not signature:
        raise HTTPException(
            status_code=400, detail="Missing signature in request body"
        )

    if not verify_mailgun(signature, signing_key):
        raise HTTPException(status_code=400, detail="Invalid signature")

    parent_key = os.getenv("MAILGUN_PARENT_WEBHOOK_SIGNING_KEY")
    if signature.get("parent-signature") and parent_key:
        if not verify_parent_signature(signature, parent_key):
            raise HTTPException(
                status_code=400, detail="Invalid parent-signature"
            )

    event_data = payload.get("event-data")
    if not event_data or not event_data.get("event"):
        raise HTTPException(status_code=400, detail="Missing event-data")

    event = event_data["event"]
    recipient = event_data.get("recipient")

    if event == "accepted":
        print(f"Accepted: {recipient}")
    elif event == "rejected":
        reason = (event_data.get("reject") or {}).get("reason")
        print(f"Rejected: {recipient} - {reason}")
    elif event == "delivered":
        print(f"Delivered: {recipient}")
        # Mark message as delivered in your database
    elif event == "failed":
        # severity is 'permanent' (hard bounce) or 'temporary' (soft bounce)
        severity = event_data.get("severity")
        print(f"Failed ({severity}): {recipient}")
        if severity == "permanent":
            # Add address to your local suppression list
            pass
    elif event == "opened":
        print(f"Opened: {recipient}")
    elif event == "clicked":
        print(f"Clicked: {recipient} -> {event_data.get('url')}")
    elif event == "unsubscribed":
        print(f"Unsubscribed: {recipient}")
    elif event == "complained":
        print(f"Complained (spam): {recipient}")
    elif event == "stored":
        storage = event_data.get("storage") or {}
        print(f"Stored inbound message at {storage.get('url')}")
    elif event == "list_member_uploaded":
        print("List member uploaded")
    else:
        print(f"Unhandled event type: {event}")

    return JSONResponse(content={"received": True}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)
