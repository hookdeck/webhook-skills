# Generated with: idenfy-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_idenfy_signature(raw_body: bytes, signature, secret=None) -> bool:
    """iDenfy sends Idenfy-Signature: bare lowercase hex HMAC-SHA256 of the raw request body,
    keyed with the webhook's signing key used as a UTF-8 string (no prefix, no timestamp).
    Both sides are compared as bytes: compare_digest raises TypeError on a non-ASCII str,
    which would turn a bad header into a 500 instead of a 401. Hex is case-insensitive, so the
    header is lowercased first."""
    if secret is None:
        secret = os.environ.get("IDENFY_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def handle_event(event_type, body: dict) -> None:
    # The event name is in the Idenfy-Event-Type header, not the body.
    scan_ref = body.get("scanRef")

    if event_type == "IDENTIFICATION_AUTO_FINISHED":
        print(f"KYC auto review finished (scanRef {scan_ref}, final: {body.get('final')})", body.get("status"))
        # TODO: if final is false, wait for IDENTIFICATION_MANUAL_FINISHED

    elif event_type == "IDENTIFICATION_MANUAL_FINISHED":
        print(f"KYC manual review finished (scanRef {scan_ref})", body.get("status"))
        # TODO: record the final approve/deny decision

    elif event_type == "IDENTIFICATION_EXPIRED":
        print(f"KYC verification expired (scanRef {scan_ref})")

    elif event_type == "IDENTIFICATION_CANCELLED":
        print(f"KYC verification cancelled (scanRef {scan_ref})")

    elif event_type == "COMPANY_REVIEW":
        print("KYB company review completed", body)

    elif event_type == "AML_MONITORING":
        print("AML monitoring result", body)

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/idenfy")
async def idenfy_webhook(request: Request):
    # Raw bytes, whatever the content type: the signature covers exactly these.
    raw_body = await request.body()

    if not verify_idenfy_signature(raw_body, request.headers.get("idenfy-signature")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(request.headers.get("idenfy-event-type"), body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling iDenfy event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
