import os
import re
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_flux_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify a Flux CD generic-hmac webhook.

    X-Signature is `sha256=<hex>` (bare hex is also accepted): HMAC-SHA256 of the raw body only.
    """
    if not signature or not secret:
        return False

    digest = signature.removeprefix("sha256=")

    # Validate the format before decoding: exactly 64 hex characters (case-insensitive)
    if not HEX_DIGEST.fullmatch(digest):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    received = bytes.fromhex(digest)

    # Timing-safe comparison on bytes
    return hmac.compare_digest(received, expected)


@app.post("/webhooks/flux-cd")
async def flux_cd_webhook(request: Request):
    # Raw bytes for any content type; never decode and re-encode before verifying
    raw_body = await request.body()
    signature = request.headers.get("x-signature")

    if not verify_flux_webhook(raw_body, signature, os.environ.get("FLUX_CD_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Flux has no event-name field: branch on severity and reason
    severity = event.get("severity")
    reason = event.get("reason")
    message = event.get("message")
    obj = _as_dict(event.get("involvedObject"))
    target = f"{obj.get('kind')}/{obj.get('namespace')}/{obj.get('name')}"

    if severity == "error":
        print(f"Flux error on {target}: {reason} - {message}")
        # TODO: Page on-call, open an incident, etc. (e.g. reason ValidationFailed, ReconciliationFailed)
    elif severity == "info":
        print(f"Flux info on {target}: {reason} - {message}")
        # TODO: Record deploys, notify a channel, etc. (e.g. reason ReconciliationSucceeded)
    else:
        print(f"Unhandled severity: {severity}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
