# Generated with: bump-sh-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_bump_signature(raw_body: bytes, header: Optional[str], secret: str) -> bool:
    """Verify a Bump.sh webhook signature.

    Bump.sh sends `X-Bump-Signature-256: sha256=<hex>` where <hex> is the
    lowercase hex HMAC-SHA256 of the raw request body, keyed with the webhook's
    secret token (used as UTF-8 bytes). Only the body is signed, so there is no
    timestamp to check. A bare 64-hex value (no prefix) is accepted too.
    """
    if not secret or not header:
        return False

    signature = header.removeprefix("sha256=")

    # Validate length and alphabet before decoding.
    if not HEX_SHA256.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    # compare_digest on bytes, never str
    return hmac.compare_digest(bytes.fromhex(signature), expected)


@app.post("/webhooks/bump-sh")
async def bump_sh_webhook(request: Request):
    secret = os.environ.get("BUMP_SH_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: the signature covers the body exactly as received.
    raw_body = await request.body()

    if not verify_bump_signature(
        raw_body, request.headers.get("x-bump-signature-256"), secret
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature is verified.
    try:
        payload = json.loads(raw_body)
    except ValueError:  # includes UnicodeDecodeError and JSONDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Unexpected payload")

    # Bump.sh has a single notification (a documentation structure change) with
    # body {api, diff} and no event-name field. Check types before reading in.
    api = payload.get("api")
    diff = payload.get("diff")
    print(
        "Bump.sh documentation structure change received",
        {
            "api_keys": list(api) if isinstance(api, dict) else None,
            "diff_keys": list(diff) if isinstance(diff, dict) else None,
        },
    )
    # TODO: post to chat, open a ticket, regenerate SDKs, notify API consumers, etc.

    # Return 200 to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
