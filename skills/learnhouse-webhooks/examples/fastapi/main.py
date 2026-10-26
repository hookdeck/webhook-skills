# Generated with: learnhouse-webhooks skill
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

# Deliveries are at-least-once. Use a database or cache in production.
seen_deliveries: set[str] = set()


def verify_learnhouse_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    """Verify X-Webhook-Signature: sha256=<hex>.

    The signature is the HMAC-SHA256 of the raw body bytes, keyed with the whole
    whsec_... secret as plain UTF-8 (NOT Standard Webhooks).
    """
    if not header or not secret:
        return False
    value = header[len("sha256="):] if header.startswith("sha256=") else header
    # Validate length and alphabet before decoding
    if not HEX_SHA256.fullmatch(value):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)


def as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def as_str(value) -> str | None:
    return value if isinstance(value, str) else None


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/learnhouse")
async def learnhouse_webhook(request: Request):
    # Read the raw bytes BEFORE parsing: the signature covers the exact body
    raw_body = await request.body()

    if not verify_learnhouse_signature(
        raw_body,
        request.headers.get("x-webhook-signature"),
        os.environ.get("LEARNHOUSE_WEBHOOK_SECRET"),
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification, and treat every field as untrusted
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict) or not isinstance(payload.get("event"), str):
        raise HTTPException(status_code=400, detail="Invalid payload")

    event = payload["event"]
    delivery_id = as_str(payload.get("delivery_id")) or request.headers.get("x-webhook-delivery")
    if delivery_id:
        if delivery_id in seen_deliveries:
            return {"received": True, "duplicate": True}
        seen_deliveries.add(delivery_id)

    data = as_dict(payload.get("data"))
    user = as_dict(data.get("user"))
    course = as_dict(data.get("course"))

    if event == "ping":
        print("LearnHouse ping received")
    elif event == "course_enrolled":
        print(f"{as_str(user.get('email'))} enrolled in {as_str(course.get('name'))}")
    elif event == "course_completed":
        print(f"{as_str(user.get('email'))} completed {as_str(course.get('name'))}")
        # e.g. send a certificate email, update your CRM
    elif event in ("activity_completed", "assignment_submitted", "assignment_graded", "certificate_claimed"):
        print(f"LearnHouse {event} (delivery {delivery_id})")
    elif event == "user_signed_up":
        print(f"New LearnHouse user: {as_str(user.get('email'))}")
    else:
        print(f"Unhandled LearnHouse event: {event}")

    # Any 2xx marks the delivery successful
    return {"received": True}
