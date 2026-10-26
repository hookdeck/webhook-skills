# Generated with: treet-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Treet Webhook Handler")

# Treet's docs don't name the HTTP method, so accept all the usual ones.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Standard padded base64 of a 32-byte digest: 43 characters plus one "=".
_SIGNATURE_RE = re.compile(r"^[A-Za-z0-9+/]{43}=$")


def verify_treet_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """
    X-Treet-Signature is base64(HMAC-SHA256(secret, raw body)), the whole header value.
    The key is the secret's UTF-8 bytes; the message is the raw body bytes (no timestamp).
    """
    if not secret:
        return False  # never accept when unconfigured
    if not signature or not _SIGNATURE_RE.match(signature):
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    )
    # compare_digest on bytes (str raises on non-ASCII); both are 44 ASCII bytes
    return hmac.compare_digest(signature.encode("ascii"), expected)


def handle_treet_event(payload: Dict[str, Any]) -> None:
    # `trigger` is the specific event; `topic` is the coarser topic ("label").
    trigger = payload.get("trigger")

    if trigger == "label/created":
        print(f"Shipping label created for bundle {payload.get('bundleId')}")
        # TODO: store the carrier and tracking number
    elif trigger == "label/updated":
        print(f"Shipping label updated for bundle {payload.get('bundleId')}: {payload.get('status')}")
        # TODO: update the shipment status
    else:
        print(f"Unhandled Treet trigger: {trigger}")


@app.api_route("/webhooks/treet", methods=ALLOWED_METHODS)
async def handle_treet_webhook(request: Request):
    secret = os.getenv("TREET_WEBHOOK_SECRET")
    if not secret:
        print("Set TREET_WEBHOOK_SECRET")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes, exactly as received. A request with no body gives b"".
    raw = await request.body()

    # Signature first, for every method.
    if not verify_treet_signature(raw, request.headers.get("x-treet-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    # GET and DELETE (and some PUT/PATCH) carry no body: acknowledge them.
    if not raw.strip():
        return {"received": True}

    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_treet_event(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Treet event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
