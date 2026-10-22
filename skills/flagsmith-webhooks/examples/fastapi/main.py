# Generated with: flagsmith-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_flagsmith_signature(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify X-Flagsmith-Signature: hex HMAC-SHA256 of the raw body, keyed with the secret.

    Flagsmith has no timestamp header, so there is no replay window to check.
    """
    if not raw_body or not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest is timing-safe; it returns False on length mismatch
    return hmac.compare_digest(expected.encode(), signature_header.strip().lower().encode())


@app.post("/webhooks/flagsmith")
async def flagsmith_webhook(
    request: Request,
    x_flagsmith_signature: Optional[str] = Header(default=None),
):
    secret = os.getenv("FLAGSMITH_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not x_flagsmith_signature:
        raise HTTPException(status_code=400, detail="Missing X-Flagsmith-Signature header")

    # CRITICAL: read raw bytes (any content type) - the signature covers these exact bytes
    raw_body = await request.body()

    if not verify_flagsmith_signature(raw_body, x_flagsmith_signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Environment and audit-log webhooks use {event_type, data}.
    # Identity webhooks have no event_type: they send {identity, flags, traits, segments}.
    event_type = payload.get("event_type")
    data = payload.get("data") or {}

    if event_type == "FLAG_UPDATED":
        print(f"Flag updated: {(data.get('new_state') or {}).get('feature', {}).get('name')}")
    elif event_type == "FLAG_DELETED":
        feature = data.get("feature") or (data.get("new_state") or {}).get("feature") or {}
        print(f"Flag deleted: {feature.get('name')}")
    elif event_type == "AUDIT_LOG_CREATED":
        print(f"Audit log: {data.get('log')}")
    elif event_type is None:
        if "identity" in payload:
            print(f"Identity evaluation for: {payload['identity']}")
        else:
            print("Unrecognized Flagsmith payload")
    else:
        print(f"Unhandled Flagsmith event: {event_type}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
