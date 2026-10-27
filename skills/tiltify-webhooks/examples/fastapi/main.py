# Generated with: tiltify-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hmac
import hashlib
import json
import os
import re
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Standard base64, padded: 32 bytes -> 43 characters + '='.
BASE64_SHA256 = re.compile(r"[A-Za-z0-9+/]{43}=")
# ISO-8601 UTC, e.g. 2023-04-18T16:49:00.617031Z
ISO_UTC = re.compile(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z")


def tolerance_from_env() -> int:
    """Optional replay window in seconds. Off by default (unset or 0): Hookdeck
    retries and replays resend the original headers, so a fixed window would
    reject legitimate deliveries."""
    try:
        return max(int(os.getenv("TILTIFY_WEBHOOK_TOLERANCE_SECONDS", "0")), 0)
    except ValueError:
        return 0


def parse_iso_utc(value: str) -> datetime | None:
    match = ISO_UTC.fullmatch(value)
    if not match:
        return None
    micros = (match.group(2) or "").ljust(6, "0")[:6]
    try:
        return datetime.strptime(f"{match.group(1)}.{micros}", "%Y-%m-%dT%H:%M:%S.%f").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        return None


def verify_tiltify_signature(
    raw_body: bytes,
    signature_header: str | None,
    timestamp_header: str | None,
    secret: str,
    tolerance_seconds: int = 0,
    now: datetime | None = None,
) -> tuple[bool, str | None]:
    """Verify a Tiltify webhook signature.

    Header:         X-Tiltify-Signature: <base64 digest> (padded, no prefix)
    Signed content: f"{X-Tiltify-Timestamp}." + raw body bytes
    Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes (not hex-decoded)
    """
    if not signature_header:
        return False, "Missing X-Tiltify-Signature header"
    if not timestamp_header:
        return False, "Missing X-Tiltify-Timestamp header"
    # Validate length and alphabet before decoding.
    if not BASE64_SHA256.fullmatch(signature_header):
        return False, "Malformed X-Tiltify-Signature header"

    if tolerance_seconds > 0:
        # Checked only when the opt-in tolerance is set.
        sent = parse_iso_utc(timestamp_header)
        if sent is None:
            return False, "Malformed X-Tiltify-Timestamp header"
        current = now or datetime.now(timezone.utc)
        if abs((current - sent).total_seconds()) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    # Build the signed message as bytes: header value as latin-1, raw body untouched.
    try:
        signed_content = b"".join([timestamp_header.encode("latin-1"), b".", raw_body])
    except UnicodeEncodeError:
        return False, "Malformed X-Tiltify-Timestamp header"
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    )
    # Compare the base64 text, as Hookdeck does: decoding would also accept a
    # non-canonical last character (stray low bits) that maps to the same digest.
    received = signature_header.encode("ascii")

    if hmac.compare_digest(expected, received):
        return True, None
    return False, "Invalid signature"


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body, check the signature, return the bytes."""
    secret = os.getenv("TILTIFY_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    valid, error = verify_tiltify_signature(
        raw_body,
        request.headers.get("x-tiltify-signature"),
        request.headers.get("x-tiltify-timestamp"),
        secret,
        tolerance_from_env(),
    )
    if not valid:
        print(f"Tiltify webhook verification failed: {error}")
        raise HTTPException(status_code=401, detail=error)
    return raw_body


DONATION_EVENTS = {
    "public:direct:donation_updated",
    "private:direct:donation_updated",
    "public:indirect:donation_updated",
    "private:indirect:donation_updated",
}
FACT_EVENTS = {
    "public:direct:fact_updated",
    "private:direct:fact_updated",
    "public:indirect:fact_updated",
    "private:indirect:fact_updated",
}


def handle_event(event: dict) -> None:
    meta = event.get("meta") if isinstance(event.get("meta"), dict) else {}
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    event_type = meta.get("event_type")
    event_id = meta.get("id")
    if event_type in DONATION_EVENTS:
        # New, moderated or refunded donation. The same donation can arrive more
        # than once, so deduplicate on meta.id.
        print(f"{event_type}: donation {data.get('id')} (event {event_id})")
    elif event_type in FACT_EVENTS:
        # A campaign, team campaign or fundraising event changed (e.g. amount_raised).
        print(f"{event_type}: fact {data.get('id')} (event {event_id})")
    else:
        # Unknown or future types: log and acknowledge.
        print(f"Unhandled Tiltify event type: {event_type}")


@app.post("/webhooks/tiltify")
async def tiltify_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse only after the signature check.
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # In production: persist the event, return 2xx, then process asynchronously.
    # Tiltify deactivates an endpoint after 12 failed retries.
    handle_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
