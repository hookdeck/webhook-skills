# Generated with: stytch-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Stytch Webhook Handler")

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set STYTCH_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("STYTCH_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "STYTCH_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


class WebhookVerificationError(Exception):
    pass


def verify_svix_signature(raw_body: bytes, headers, secret: str, tolerance: int | None = None) -> None:
    """Verify a Svix-signed delivery (the Standard Webhooks scheme); raise if it's invalid.

    Written out rather than calling the `svix` SDK, because the SDK always enforces a
    5-minute timestamp window. Hookdeck retries and replays carry the original
    svix-timestamp, so that window would reject them. Here the window is opt-in via
    STYTCH_TIMESTAMP_TOLERANCE_SECONDS.
    """
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        raise WebhookVerificationError("Missing Svix signature headers")
    if not (timestamp.isascii() and timestamp.isdigit()):
        raise WebhookVerificationError("Invalid svix-timestamp")
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        raise WebhookVerificationError("Timestamp outside tolerance")

    # Key = base64-decoded secret after the whsec_ prefix
    try:
        key = base64.b64decode(secret[len("whsec_"):] if secret.startswith("whsec_") else secret)
    except (binascii.Error, ValueError) as exc:
        raise WebhookVerificationError("Secret is not valid base64") from exc
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    # svix-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return
    raise WebhookVerificationError("No matching signature")


def stytch_event_type(body: Any) -> Optional[str]:
    """Stytch bodies carry source, object_type and action but no combined type field."""
    if not isinstance(body, dict):
        return None
    parts = [body.get("source"), body.get("object_type"), body.get("action")]
    if not all(isinstance(p, str) and p for p in parts):
        return None
    return ".".join(parts).lower()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/stytch")
async def stytch_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("STYTCH_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # RAW body: verification needs the exact bytes Stytch (Svix) signed
    raw_body = await request.body()

    try:
        # Checks HMAC-SHA256 over f"{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature. The timestamp window is opt-in (STYTCH_TIMESTAMP_TOLERANCE_SECONDS).
        verify_svix_signature(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
            secret,
        )
    except WebhookVerificationError as err:
        detail = "Timestamp too old" if "outside tolerance" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = stytch_event_type(event)
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received Stytch webhook {svix_id}: {event_type}")

    # Webhooks are unordered: treat them as a signal and re-fetch from the Stytch API
    if event_type == "direct.user.create":
        print("User created:", event.get("id"))
    elif event_type == "direct.user.update":
        print("User updated:", event.get("id"))
    elif event_type in ("direct.organization.create", "dashboard.organization.create"):
        print("Organization created:", event.get("id"))
    elif event_type in ("direct.member.update", "scim.member.update"):
        print("Member updated:", event.get("id"))
    elif event_type == "direct.saml_connection.delete":
        # DELETE events carry only the id, no entity object
        print("SAML connection deleted:", event.get("id"))
    else:
        print("Unhandled event type:", event_type)

    return {"success": True, "type": event_type}
