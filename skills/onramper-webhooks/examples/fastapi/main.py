# Generated with: onramper-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

_HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_onramper_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Onramper signs the raw body: X-Onramper-Webhook-Signature is the bare lowercase
    hex HMAC-SHA256 of the body, keyed with the secret's UTF-8 bytes. Nothing else is
    signed, so there is no timestamp window to check."""
    if not secret or not signature or not _HEX64.fullmatch(signature):
        return False  # validate length and alphabet before decoding
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str


def handle_event(tx: dict) -> None:
    """Every delivery is a transaction snapshot with no event name, so dispatch on
    `status`. `transactionType` (buy | offramp) gives the direction."""
    status = tx.get("status")
    ref = f"{tx.get('transactionId')} ({tx.get('transactionType')})"

    if status == "completed":
        print(f"Transaction completed: {ref}")
        # TODO: fulfil the order using outAmount, targetCurrency, transactionHash

    elif status == "paid":
        print(f"Transaction paid: {ref}")

    elif status == "pending":
        print(f"Transaction pending: {ref}")

    elif status == "new":
        print(f"Transaction created: {ref}")

    elif status == "failed":
        print(f"Transaction failed: {ref}")
        # TODO: notify the customer or alert support

    elif status == "canceled":
        print(f"Transaction canceled: {ref}")

    else:
        print(f"Unhandled status: {status} ({ref})")


@app.post("/webhooks/onramper")
async def onramper_webhook(request: Request):
    # Raw bytes, whatever the content type: this is what gets verified.
    raw_body = await request.body()
    signature = request.headers.get("x-onramper-webhook-signature")

    if not signature:
        raise HTTPException(status_code=401, detail="Missing signature header")
    if not verify_onramper_signature(raw_body, signature, os.environ.get("ONRAMPER_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check.
    try:
        tx = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(tx, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        handle_event(tx)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Onramper webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
