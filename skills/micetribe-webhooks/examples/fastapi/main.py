# Generated with: micetribe-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

# X-Timestamp window, off by default (0). A gateway such as Hookdeck re-sends retries and
# replays with the original X-Timestamp, so a default window would reject them. Set
# MICETRIBE_WEBHOOK_TOLERANCE_SECONDS to a positive value to opt in.
DEFAULT_TOLERANCE_SECONDS = 0
_warned_invalid_tolerance = False

_HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

# In-memory dedupe for the demo. Use a durable store (Redis, database unique key) in production.
processed = set()


def verify_micetribe_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[float] = None,
) -> Tuple[bool, Optional[str]]:
    """Verify a MICEtribe webhook. Returns (valid, error).

    X-Signature = hex HMAC-SHA256( secret, X-Timestamp + "." + raw_request_body ), keyed with the
    webhook's signing secret as UTF-8 bytes. The signed message is built as bytes: the X-Timestamp
    header string (latin-1), a literal ".", then the exact body bytes.
    """
    if not signature:
        return False, "Missing X-Signature header"
    if not timestamp:
        return False, "Missing X-Timestamp header"
    if not secret:
        return False, "Missing webhook secret"
    # Validate the format before decoding (re.fullmatch: no trailing-newline surprise from `$`).
    if not _HEX_SHA256.fullmatch(signature):
        return False, "Malformed X-Signature header"

    if tolerance_seconds > 0:
        if not (timestamp.isascii() and timestamp.isdigit()):
            return False, "Invalid X-Timestamp header"
        current = time.time() if now is None else now
        if abs(current - int(timestamp)) > tolerance_seconds:
            return False, "Timestamp outside tolerance window"

    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # validated above
    if not hmac.compare_digest(received, expected):
        return False, "Invalid signature"
    return True, None


def tolerance_from_env() -> int:
    """A value that isn't a whole number of seconds is treated as 0 (check off), with a warning."""
    global _warned_invalid_tolerance
    raw = (os.getenv("MICETRIBE_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return DEFAULT_TOLERANCE_SECONDS
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "MICETRIBE_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


tolerance_from_env()  # surface an invalid value at startup


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: verify X-Signature over X-Timestamp + "." + raw body, return the bytes."""
    secret = os.getenv("MICETRIBE_WEBHOOK_SECRET")
    if not secret:
        print("MICETRIBE_WEBHOOK_SECRET is not set - refusing unauthenticated webhooks")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # IMPORTANT: use the raw bytes. X-Signature covers exactly what MICEtribe sent.
    raw_body = await request.body()
    try:
        valid, error = verify_micetribe_signature(
            raw_body,
            request.headers.get("x-signature"),
            request.headers.get("x-timestamp"),
            secret,
            tolerance_from_env(),
        )
    except UnicodeEncodeError:
        # A timestamp header that can't be latin-1 encoded can't match what was signed.
        valid, error = False, "Invalid X-Timestamp header"
    if not valid:
        print(f"MICEtribe webhook rejected: {error}")
        raise HTTPException(status_code=401, detail=error)
    return raw_body


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/micetribe")
async def micetribe_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    meta = event.get("meta") if isinstance(event.get("meta"), dict) else {}
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    trigger = meta.get("trigger")
    registration_id = event.get("registration_id")

    # Idempotency key: registration_id + meta.trigger + X-Request-Id.
    key = f"{registration_id}:{trigger}:{request.headers.get('x-request-id')}"
    if key in processed:
        return {"received": True, "duplicate": True}
    processed.add(key)

    print(f"Verified MICEtribe webhook: {trigger} (registration {registration_id})")

    if trigger == "registration.created":
        # A new registration was created. data.registration_data holds the attendee's fields.
        email = _as_dict(data.get("registration_data")).get("email")
        print(f"New registration for {email} ({meta.get('event_name')})")
    elif trigger == "registration.updated":
        # An existing registration changed. data.entry_status is e.g. "Approved".
        print(f"Registration {registration_id} updated, status {data.get('entry_status')}")
    elif trigger == "registration.deleted":
        print(f"Registration {registration_id} deleted")
    elif trigger == "registration.attended":
        # Attendance recorded: data.checkin.attended / checkin_at.
        print(f"Registration {registration_id} attended at {_as_dict(data.get('checkin')).get('checkin_at')}")
    elif trigger == "registration.printed":
        # Badge printed: data.print.print_count / last_printed_at.
        print(f"Registration {registration_id} badge printed ({_as_dict(data.get('print')).get('print_count')})")
    else:
        print(f"Unhandled MICEtribe event: {trigger}")

    # Respond 2xx within 10 seconds; 3xx and above, errors and timeouts are retried.
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
