# Generated with: felloh-webhooks skill
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

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_felloh_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Felloh sends the bare hex HMAC-SHA256 of the raw request body in X-Signature.

    The signing key is used as UTF-8 bytes. The format is checked first (fullmatch, so a
    trailing newline can't slip through), then compared on bytes in constant time.
    """
    secret = secret if secret is not None else os.environ.get("FELLOH_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str) or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


def classify(payload: dict):
    """Felloh has no event-name field or header, so deliveries are told apart by shape.
    Every field is untrusted: check types before reading into nested objects."""
    if isinstance(payload.get("user"), dict):
        return "user-create"
    if isinstance(payload.get("transaction"), dict) and isinstance(payload.get("status"), dict):
        return "refund-status"
    if isinstance(payload.get("transaction"), dict) and isinstance(payload.get("status"), str):
        return "transaction-status"
    if isinstance(payload.get("booking"), dict) and "transaction" not in payload:
        return "booking"
    return None


def handle_event(payload: dict) -> None:
    kind = classify(payload)

    if kind == "transaction-status":
        # Retried up to 5 times about a minute apart, so make this idempotent.
        print(f"Transaction {payload['transaction'].get('id')} is {payload['status']}")
        # TODO: update the order or payment for payload["booking"]["booking_reference"]

    elif kind == "refund-status":
        print(f"Refund for transaction {payload['transaction'].get('id')} is {payload['status'].get('id')}")
        # TODO: update the refund record (payload["authorisation_code"], payload["amount"])

    elif kind == "booking":
        print(f"Booking {payload['booking'].get('booking_reference')}")
        # TODO: sync the booking (customer_name, departure_date, return_date)

    elif kind == "user-create":
        print(f"User created: {payload['user'].get('id')}")
        # TODO: provision or audit the new user (email, organisation)

    else:
        print("Unhandled Felloh delivery")


@app.post("/webhooks/felloh")
async def felloh_webhook(request: Request):
    # Raw bytes, so the exact body is verified whatever the content type.
    raw_body = await request.body()

    if not verify_felloh_signature(raw_body, request.headers.get("x-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    # Dashboard test deliveries are signed with the real key and never retried.
    if request.headers.get("x-felloh-test") == "true":
        print("Felloh test delivery")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Felloh event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
