# Generated with: govuk-notify-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

BEARER = "bearer "


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on bytes; str would raise on non-ASCII)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def verify_notify_request(headers, secret=None) -> bool:
    """GOV.UK Notify does not sign callbacks. It sends `Authorization: Bearer <token>`, where
    the token is the one you set for the callback. The secret is the BARE token; if the
    configured value itself starts with "Bearer " (any case) that prefix is stripped, as
    Hookdeck does. The scheme is matched case-insensitively (RFC 9110); the token is never
    trimmed.
    """
    secret = secret if secret is not None else os.environ.get("GOVUK_NOTIFY_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    expected = secret[len(BEARER):] if secret.lower().startswith(BEARER) else secret
    if not expected:
        return False

    header = headers.get("authorization")
    if not header or not header.lower().startswith(BEARER):
        return False
    return safe_equal(header[len(BEARER):].encode("utf-8"), expected.encode("utf-8"))


async def require_notify_bearer(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_notify_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization bearer token")


def classify_callback(payload: dict) -> str:
    """Callbacks have no event field: tell the three kinds apart by shape."""
    if isinstance(payload.get("status"), str) and "notification_type" in payload:
        return "delivery_receipt"
    if "source_number" in payload and "destination_number" in payload:
        return "received_text"
    if "notification_id" in payload and "date_sent" in payload:
        return "returned_letter"
    return "unknown"


def handle_callback(payload: dict) -> None:
    kind = classify_callback(payload)

    if kind == "delivery_receipt":
        # status: delivered, permanent-failure, temporary-failure, technical-failure
        print(f"Delivery receipt {payload.get('id')}: {payload.get('status')} ({payload.get('notification_type')})")
        # TODO: update the notification by payload["reference"] / payload["id"]; retry or alert on failures

    elif kind == "received_text":
        print(f"Text message from {payload.get('source_number')}: {payload.get('message')}")
        # TODO: route the reply (payload["destination_number"], payload["date_received"])

    elif kind == "returned_letter":
        print(f"Letter returned: {payload.get('notification_id')}")
        # TODO: flag the address as bad (payload["reference"], payload["template_name"])

    else:
        print("Unhandled GOV.UK Notify callback shape")


@app.post("/webhooks/govuk-notify", dependencies=[Depends(require_notify_bearer)])
async def govuk_notify_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_callback(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling GOV.UK Notify callback: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
