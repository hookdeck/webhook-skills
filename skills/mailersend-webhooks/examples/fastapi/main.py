# Generated with: mailersend-webhooks skill
# https://github.com/hookdeck/webhook-skills

"""MailerSend webhook receiver.

MailerSend signs every webhook with a `Signature` header: the lowercase hex
HMAC-SHA256 of the RAW request body, keyed with the per-webhook Signing Secret.
There is no timestamp, no nonce, no version prefix and no field concatenation —
the body alone is signed.

https://developers.mailersend.com/api/v1/account/webhooks.html#security

The official Python SDK (`mailersend`) ships no webhook verification helper, so
verification here is manual — matching the algorithm in MailerSend's own
Node/Go/PHP samples.
"""

import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="MailerSend Webhook Handler")

# MailerSend signs its URL-validation ping with this FIXED, PUBLICLY DOCUMENTED
# secret instead of your webhook's signing secret.
#
# You must accept it: if the ping doesn't get a 2xx, MailerSend refuses to save
# the webhook at all.
#
# But because it is public, ANYONE can produce a request that verifies against
# it. A `webhook.test` request therefore proves nothing about the sender, and a
# test-secret signature must never authorise a real event.
MAILERSEND_TEST_SECRET = "test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G"

# "2025-08-05 22:27:14" — sender_identity.verified and maintenance.* only
_SPACED_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")


# === Signature verification ================================================


def verify_signature(raw_body: bytes, signature: Optional[str], secret: str) -> bool:
    """Verify a MailerSend `Signature` header.

    Args:
        raw_body: the exact bytes received. Re-serialising parsed JSON changes
            the bytes and breaks verification.
        signature: value of the `Signature` header (bare lowercase hex digest).
        secret: the webhook's signing secret, used as the raw UTF-8 HMAC key.
    """
    if not signature or not secret or raw_body is None:
        return False

    expected = hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()

    # compare_digest raises TypeError on non-ASCII str input, so compare bytes.
    # It returns False on a length mismatch rather than raising (unlike Node's
    # crypto.timingSafeEqual), so no explicit length guard is needed here.
    received = signature.strip().lower().encode("utf-8", "ignore")
    return hmac.compare_digest(received, expected.encode("ascii"))


# === Payload helpers =======================================================


def parse_created_at(value: Any) -> Optional[datetime]:
    """Parse MailerSend's `created_at`, which arrives in TWO documented formats.

    "2025-08-05T21:23:54.000000Z"  activity + inbound events, and webhook.test
    "2025-08-05 22:27:14"          sender_identity.verified, maintenance.*

    The second form carries no timezone; MailerSend timestamps are UTC, so it is
    read as UTC rather than as naive local time.
    """
    if not isinstance(value, str):
        return None

    text = value.strip()
    if _SPACED_TIMESTAMP.match(text):
        text = text.replace(" ", "T") + "+00:00"
    elif text.endswith("Z"):
        # datetime.fromisoformat only accepts "Z" from Python 3.11
        text = text[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def normalize_meta(meta: Any) -> dict:
    """`data.meta` is an empty LIST (`[]`) when there is nothing to report.

    It is a dict otherwise. Normalise so downstream code always sees a dict —
    this is what breaks naive typed deserialisation.
    """
    if isinstance(meta, dict):
        return meta
    return {}


# === Event handling ========================================================

# MailerSend sends no delivery id, timestamp or nonce, so transport-level replay
# protection is impossible. Dedupe on `type` plus `data.id` instead: `data.id`
# alone is shared by e.g. activity.opened and activity.opened_unique, and some
# events (maintenance.*, reputation changes) have no `data.id` at all. Use a shared, durable
# store (Redis, Postgres) in production — this set is per-process and lost on
# restart.
_processed_event_ids: set[str] = set()


def already_processed(event_id: Any) -> bool:
    if not isinstance(event_id, str) or not event_id:
        return False
    if event_id in _processed_event_ids:
        return True
    _processed_event_ids.add(event_id)
    return False


def handle_event(event: dict) -> None:
    """Dispatch a verified MailerSend event.

    NOTE: `data["type"]` is the BARE activity name (`sent`, `hard_bounced`) with
    no `activity.` prefix. The top-level `type` is the fully-qualified event
    name — switch on that.
    """
    event_type = event.get("type")
    data = event.get("data") or {}
    meta = normalize_meta(data.get("meta"))
    occurred_at = parse_created_at(event.get("created_at"))
    # Activity events name the address in `recipient`; on-hold events in `email`.
    email = data.get("recipient") or data.get("email")

    # --- Activity events ---------------------------------------------------
    if event_type == "activity.sent":
        print(f"Sent to {email} (message {data.get('message_id')})")
        # Your code: mark queued -> sent

    elif event_type == "activity.delivered":
        print(f"Delivered to {email} at {occurred_at}")
        # Your code: confirm delivery

    elif event_type == "activity.soft_bounced":
        print(f"Soft bounce for {email}: {meta}")
        # Your code: count consecutive soft bounces; suppress after a threshold

    elif event_type == "activity.hard_bounced":
        print(f"HARD bounce for {email}: {meta}")
        # Your code: suppress this address immediately — it will never deliver

    elif event_type == "activity.deferred":
        # Paid plans only
        print(f"Deferred for {email}: {meta}")

    elif event_type in ("activity.opened", "activity.opened_unique"):
        # `opened` fires on every open, `opened_unique` only the first time
        print(f"Open ({event_type}) by {email}")

    elif event_type in ("activity.clicked", "activity.clicked_unique"):
        # `clicked` fires on every click, `clicked_unique` only the first time
        print(f"Click ({event_type}) by {email}: {meta}")

    elif event_type == "activity.unsubscribed":
        print(f"Unsubscribe from {email}")
        # Your code: update consent and stop sending

    elif event_type == "activity.spam_complaint":
        print(f"SPAM COMPLAINT from {email}")
        # Your code: suppress immediately — this damages sending reputation

    elif event_type in ("activity.survey_opened", "activity.survey_submitted"):
        print(f"Survey event {event_type} for {email}: {meta}")

    # --- Account and platform events ---------------------------------------
    elif event_type == "sender_identity.verified":
        # NOTE: created_at is space-separated for this event
        print(f"Sender identity verified: {data}")

    elif event_type == "maintenance.start":
        print(f"MailerSend maintenance started at {occurred_at}")
        # Your code: pause non-urgent sends

    elif event_type == "maintenance.end":
        print(f"MailerSend maintenance ended at {occurred_at}")
        # Your code: resume sends

    elif event_type == "inbound_forward.failed":
        print(f"Inbound forward failed: {data}")

    elif event_type == "inbound_message.rejected":
        # Documented reasons: unsupported_attachment_type, attachment_size_exceeded
        print(f"Inbound message rejected: {data}")

    elif event_type in ("email_single.verified", "email_list.verified"):
        print(f"Verification finished: {event_type} {data}")

    elif event_type == "bulk_email.completed":
        print(f"Bulk email completed: {data}")

    elif event_type == "recipient.on_hold_added":
        print(f"Recipient placed on hold: {email} {data}")

    elif event_type == "recipient.on_hold_removed":
        print(f"Recipient removed from hold: {email} {data}")

    # --- SMS events (configured separately under SMS -> Webhooks, but the
    #     security model is identical, so one handler can serve both) --------
    elif event_type in ("sms.sent", "sms.delivered", "sms.failed"):
        print(f"SMS event {event_type}: {data}")

    else:
        print(f"Unhandled MailerSend event type: {event_type}")


# === Routes ================================================================


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/webhooks/mailersend")
async def mailersend_webhook(
    request: Request,
    # Header is exactly `Signature` — no `X-` prefix, no vendor prefix.
    # FastAPI matches header names case-insensitively.
    signature: Union[str, None] = Header(default=None),
) -> JSONResponse:
    secret = os.environ.get("MAILERSEND_WEBHOOK_SECRET")
    if not secret:
        print("MAILERSEND_WEBHOOK_SECRET is not configured")
        return JSONResponse(
            status_code=500, content={"error": "Server configuration error"}
        )

    if not signature:
        return JSONResponse(
            status_code=400, content={"error": "Missing Signature header"}
        )

    # CRITICAL: the signature covers the exact raw bytes. Take `Request` and read
    # the body yourself — a Pydantic model parameter would parse the body first
    # and you could only ever re-serialise it, which produces a different digest.
    raw_body = await request.body()

    signed_by_webhook_secret = verify_signature(raw_body, signature, secret)
    # Only try the public test secret if the real one didn't match
    signed_by_test_secret = not signed_by_webhook_secret and verify_signature(
        raw_body, signature, MAILERSEND_TEST_SECRET
    )

    if not signed_by_webhook_secret and not signed_by_test_secret:
        # 401: an authentication failure, not a malformed request. Either way
        # MailerSend does not retry non-429 4xx, so this gets one attempt.
        return JSONResponse(status_code=401, content={"error": "Invalid signature"})

    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    if not isinstance(event, dict):
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    # The URL-validation ping. Its envelope has `message`, NOT `data`, so it has
    # to be handled before anything touches event["data"]. It must get a 2xx or
    # MailerSend refuses to save the webhook.
    if event.get("type") == "webhook.test":
        print(f"MailerSend webhook.test ping: {event.get('message')}")
        # Deliberately no privileged work here — the test secret is public.
        return JSONResponse(status_code=200, content={"received": True})

    if signed_by_test_secret:
        # A real event signed with the PUBLIC test secret is a forgery attempt.
        print(f"Rejected {event.get('type')} signed with the public test secret")
        return JSONResponse(status_code=401, content={"error": "Invalid signature"})

    data = event.get("data") or {}
    dedupe_key = f"{event.get('type')}:{data['id']}" if data.get("id") else None
    if already_processed(dedupe_key):
        print(f"Duplicate event {dedupe_key}, skipping")
        return JSONResponse(status_code=200, content={"received": True})

    try:
        # MailerSend fails the attempt after 3 seconds. Keep this fast — push
        # anything slow to BackgroundTasks, Celery, or a queue.
        handle_event(event)
    except Exception as exc:  # noqa: BLE001 - surface, don't swallow
        print(f"Error handling MailerSend event: {exc}")
        # 5xx IS retried by MailerSend (unlike non-429 4xx), so this asks for
        # another attempt rather than dropping the event.
        return JSONResponse(status_code=500, content={"error": "Handler error"})

    return JSONResponse(status_code=200, content={"received": True})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
