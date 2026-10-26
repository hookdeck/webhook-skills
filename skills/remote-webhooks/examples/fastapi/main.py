# Generated with: remote-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import hashlib
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_remote_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str] = None,
    tolerance_seconds: Optional[float] = None,
) -> bool:
    """Verify a Remote webhook.

    signature = lowercase hex HMAC-SHA256(secret, raw_body + b":" + X-Remote-Timestamp)
    The signed message is built as bytes: the raw body as received, a literal ":", and the
    timestamp header exactly as sent (latin-1, never trimmed or parsed).
    """
    if secret is None:
        secret = os.getenv("REMOTE_WEBHOOK_SECRET", "")
    if tolerance_seconds is None:
        tolerance_seconds = float(os.getenv("REMOTE_WEBHOOK_TOLERANCE_SECONDS") or 0)

    if not secret or not signature or not timestamp:
        return False
    # Validate the format first: exactly 64 hex characters, no prefix.
    if not HEX_SHA256.fullmatch(signature):
        return False

    try:
        message = b"".join([raw_body, b":", timestamp.encode("latin-1")])
    except UnicodeEncodeError:
        return False

    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # 32 bytes, validated above
    if not hmac.compare_digest(received, expected):
        return False

    # Opt-in only: Hookdeck retries and replays resend the original timestamp.
    if tolerance_seconds > 0:
        if not timestamp.isascii() or not timestamp.isdigit():
            return False
        if abs(time.time() * 1000 - int(timestamp)) > tolerance_seconds * 1000:
            return False
    return True


def handle_event(event: dict) -> None:
    event_type = event.get("event_type")
    employment_id = event.get("employment_id")

    if event_type == "employment.onboarding.completed":
        print(f"Onboarding completed for employment {employment_id}")
        # TODO: provision accounts, notify the manager
    elif event_type == "employment.onboarding_task.completed":
        task = event.get("completed_task") or {}
        print(f"Onboarding task \"{task.get('name')}\" completed for employment {employment_id}")
        # TODO: update your onboarding checklist
    elif event_type == "timeoff.requested":
        print(f"Time off requested (employment {employment_id})")
        # TODO: route to the approver
    elif event_type == "timeoff.approved":
        print(f"Time off approved (employment {employment_id})")
        # TODO: update your calendar
    elif event_type == "payslip.released":
        print(f"Payslip released (employment {employment_id})")
        # TODO: fetch the payslip through the Remote API
    elif event_type == "contract.termination_date_reached":
        print(f"Contract termination date reached (employment {employment_id})")
        # TODO: start offboarding in your systems
    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/remote")
async def remote_webhook(request: Request):
    # Read the exact bytes: nothing is parsed before the signature check.
    raw_body = await request.body()

    if not verify_remote_signature(
        raw_body,
        request.headers.get("x-remote-signature"),
        request.headers.get("x-remote-timestamp"),
    ):
        # Remote counts 4xx as delivered and never retries it.
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(event)
    except Exception as exc:  # Remote does not retry 5xx either: log, then replay via the webhook-events API
        print(f"Error handling Remote event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
