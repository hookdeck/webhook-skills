# Generated with: cyera-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hmac
import hashlib
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

# Cyera Privacy signs: base64( HMAC-SHA256( secret, "{X-Webhook-Timestamp}:{raw body}" ) )
# and sends the bare, padded, standard-base64 digest in X-Webhook-Signature.
SIGNATURE_RE = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_cyera_signature(
    raw_body: bytes,
    signature: str | None,
    timestamp: str | None,
    secret: str,
    tolerance_seconds: int = 0,
) -> tuple[bool, str | None]:
    """Verify a Cyera Privacy webhook. Returns (valid, error).

    The signed message is built as BYTES: the timestamp header value (exact
    string, latin-1), a literal ":", then the raw body bytes as received. The
    body is never decoded, parsed or re-serialized.
    """
    if not signature:
        return False, "Missing X-Webhook-Signature header"
    if not timestamp:
        return False, "Missing X-Webhook-Timestamp header"

    # Validate the format BEFORE decoding (exact length and alphabet).
    if not SIGNATURE_RE.fullmatch(signature):
        return False, "Malformed X-Webhook-Signature (expected 44-char padded base64)"
    try:
        received = base64.b64decode(signature, validate=True)
    except ValueError:
        return False, "Malformed X-Webhook-Signature"
    # Exact (canonical) base64 only.
    if len(received) != 32 or base64.b64encode(received).decode("ascii") != signature:
        return False, "Malformed X-Webhook-Signature"

    signed_message = b"".join([timestamp.encode("latin-1"), b":", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed_message, hashlib.sha256).digest()

    # compare_digest on bytes, never str.
    if not hmac.compare_digest(received, expected):
        return False, "Signature mismatch"

    # Optional replay window. Off by default: Hookdeck retries and replays resend
    # the original headers, so a fixed window would reject legitimate redeliveries.
    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False, "X-Webhook-Timestamp is not Unix seconds"
        if abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    return True, None


def _tolerance_seconds() -> int:
    try:
        return int(os.getenv("CYERA_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        return 0


async def verified_body(request: Request) -> bytes:
    """Dependency: read the RAW body and verify it before anything parses it."""
    secret = os.getenv("CYERA_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    valid, error = verify_cyera_signature(
        raw_body,
        request.headers.get("x-webhook-signature"),
        request.headers.get("x-webhook-timestamp"),
        secret,
        _tolerance_seconds(),
    )
    if not valid:
        print(f"Cyera signature verification failed: {error}")
        raise HTTPException(status_code=401, detail=error)
    return raw_body


@app.post("/webhooks/cyera")
async def cyera_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse only AFTER the signature check.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    request_type = payload.get("request_type")

    if request_type == "health_check":
        # Cyera pings the endpoint to check it is alive.
        return {"received": True}

    if request_type in ("access", "deletion", "opt_out"):
        # Queue the data-subject request, then answer 201 Created. Completion is
        # reported LATER by a PUT to payload["webhook_callback_url"] (API key auth).
        print(
            f"Cyera {request_type} request",
            payload.get("privacy_request_id") or payload.get("opt_out_request_id"),
            payload.get("topic"),
        )
        return JSONResponse({"received": True}, status_code=201)

    if request_type == "readiness_check":
        # Cyera asks whether this system is ready to process the request.
        print("Cyera readiness check", payload.get("privacy_request_id"))
        return {"received": True}

    print(f"Unhandled Cyera request_type: {request_type}")
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
