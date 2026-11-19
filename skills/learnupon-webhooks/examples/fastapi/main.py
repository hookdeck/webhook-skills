# Generated with: learnupon-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

# Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
seen_webhook_ids: set = set()


def verify_learnupon_signature(raw_body: bytes, signature, secret=None) -> bool:
    """LearnUpon signs the raw body with HMAC-SHA256 and sends the bare hex digest in
    X-Webhook-Signature. Nothing else is signed (no timestamp), so there is no replay window.
    The format is validated (exactly 64 hex characters) before it is decoded.
    """
    secret = secret if secret is not None else os.environ.get("LEARNUPON_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    if not isinstance(signature, str) or not HEX64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    # compare_digest on bytes (it raises on non-ASCII str); hex is case-insensitive.
    return hmac.compare_digest(expected, bytes.fromhex(signature))


def handle_event(event_type: str, item: dict) -> None:
    user = _as_dict(item.get("user"))

    if event_type == "user_created":
        print(f"User created: {user.get('userId')} ({user.get('email')})")
        # Your code: provision the user in your system

    elif event_type == "user_updated":
        print(f"User updated: {user.get('userId')}")
        # Your code: sync the profile

    elif event_type in ("course_cloning_complete", "course_updated"):
        print(f"Course event: {event_type}")
        # Your code: refresh your course catalog

    elif event_type == "course_completion":
        print(f"Course completed: course {item.get('courseId')} by user {user.get('userId')} ({item.get('enrollmentStatus')})")
        # Your code: issue a certificate or update HR records

    elif event_type == "module_complete":
        print(f"Module completed: {event_type}")
        # Your code: track progress

    # LearnUpon's October 2026 changelog calls the Spree storefront webhook purchase_complete;
    # the types table lists only purchase_completion, so accept both.
    elif event_type in ("purchase_completion", "purchase_complete"):
        print(f"Purchase completed: order {item.get('orderId')} ({item.get('amountPaid')} {item.get('currency')})")
        # Your code: fulfil the order

    elif event_type in ("badge_awarded", "badge_revoked"):
        print(f"Badge event: {event_type}")
        # Your code: update recognition feeds

    elif event_type == "course_enrollment":
        print(f"Course enrollment: user {user.get('userId')} on course {item.get('courseId')}")
        # Your code: sync the roster

    elif event_type == "course_unenrollment":
        print(f"Course unenrollment: user {user.get('userId')} from course {item.get('courseId')}")
        # Your code: remove from the roster

    elif event_type in ("learning_path_enrollment", "learning_path_updated", "learning_path_completion"):
        print(f"Learning path event: {event_type}")
        # Your code: sync learning path state

    elif event_type in ("event_session_creation", "event_session_updated", "event_session_canceled"):
        print(f"Live-learning session event: {event_type} (session {item.get('sessionId')})")
        # Your code: sync your calendar

    elif event_type in (
        "event_session_series_created",
        "event_session_series_updated",
        "event_session_series_canceled",
    ):
        print(f"Live-learning session series event: {event_type} (series {item.get('id')})")
        # Your code: sync your calendar

    elif event_type in (
        "learning_journey_enrollment",
        "learning_journey_completion",
        "learning_journey_blocked",
        "learning_journey_deleted",
        "learning_journey_archived",
    ):
        print(f"Learning journey event: {event_type}")
        # Your code: sync learning journey state

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/learnupon")
async def learnupon_webhook(request: Request):
    # Verify the exact bytes received, before parsing anything.
    raw_body = await request.body()

    if not verify_learnupon_signature(raw_body, request.headers.get("x-webhook-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = request.headers.get("x-webhook-type")
    if not event_type or not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise HTTPException(status_code=400, detail='Expected {"data": [...]} and an X-Webhook-Type header')

    # LearnUpon resends failed webhooks, so dedupe on X-Webhook-ID.
    webhook_id = request.headers.get("x-webhook-id")
    if webhook_id and webhook_id in seen_webhook_ids:
        return {"received": True, "duplicate": True}

    try:
        # Up to 10 events of one type per request.
        for item in payload["data"]:
            handle_event(event_type, item if isinstance(item, dict) else {})
    except Exception as err:  # noqa: BLE001
        print(f"Error handling LearnUpon webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if webhook_id:
        seen_webhook_ids.add(webhook_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
