# Generated with: greenshades-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Greenshades documents no HTTP method, so accept every method a sender might use.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
SHA256_HEX = re.compile(r"[0-9a-fA-F]{64}")


def build_signed_content(timestamp: str, raw_body: bytes) -> bytes:
    """Signed message, as bytes: <X-GS-TIMESTAMP value> 0x0A <raw body bytes>.

    The separator is a real LF (0x0A), not the two characters backslash and n.
    """
    return b"".join([
        timestamp.encode("latin-1"),  # header value exactly as received
        b"\n",
        raw_body,  # raw bytes, never decoded and re-encoded
    ])


def verify_greenshades_signature(
    raw_body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    if not timestamp or not signature or not secret:
        return False
    # Whole header value is one bare 64-char hex digest (case-insensitive)
    if not SHA256_HEX.fullmatch(signature):
        return False

    expected = hmac.new(
        secret.encode("utf-8"),  # key used as-is, not decoded
        build_signed_content(timestamp, raw_body),
        hashlib.sha256,
    ).digest()
    received = bytes.fromhex(signature)  # format validated above
    return hmac.compare_digest(received, expected)


def timestamp_within_tolerance(
    timestamp: str, tolerance_seconds: float, now: Optional[float] = None
) -> bool:
    """Opt-in only. The X-GS-TIMESTAMP format is not documented, so it is parsed
    (epoch seconds, epoch milliseconds or an ISO date) only when a tolerance is set."""
    now = time.time() if now is None else now
    try:
        if re.fullmatch(r"\d+(\.\d+)?", timestamp):
            n = float(timestamp)
            ts = n / 1000 if n > 1e12 else n
        else:
            parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            ts = parsed.timestamp()
    except (ValueError, OverflowError):
        return False
    return abs(now - ts) <= tolerance_seconds


# Subscribed event names come from Greenshades' webhook subscription API;
# the delivery body is not documented.
EVENT_LABELS = {
    "payRun.completed": "Pay run completed",
    "payRun.costReportingTransactions.completed": "Cost reporting transactions completed",
    "payRun.payRecord.voided": "Pay record voided",
    "payRun.payRecords.completed": "Pay records completed",
    "paySchedule.updated": "Pay schedule updated",
    "employee.added": "Employee added",
    "employee.updated": "Employee updated",
    "employee.directDeposit.updated": "Direct deposit updated",
    "employee.paySchedule.updated": "Employee pay schedule updated",
    "employee.earningCode.added": "Earning code added",
    "employee.earningCode.updated": "Earning code updated",
    "employee.earningCode.deleted": "Earning code deleted",
}


def get_event_name(payload) -> Optional[str]:
    """ILLUSTRATIVE: Greenshades does not document the delivery body, so which field
    carries the event name is unknown. Check a real delivery and adjust."""
    if not isinstance(payload, dict):
        return None
    for key in ("eventName", "event", "type", "name"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    return None


@app.api_route("/webhooks/greenshades", methods=ALLOWED_METHODS)
async def greenshades_webhook(request: Request):
    secret = os.getenv("GREENSHADES_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes for every method and content type; a missing body is empty bytes
    raw_body = await request.body()
    timestamp = request.headers.get("x-gs-timestamp")
    signature = request.headers.get("x-gs-signature")

    # Verify first, for every method
    if not verify_greenshades_signature(raw_body, timestamp, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        tolerance = float(os.getenv("GREENSHADES_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if tolerance > 0 and not timestamp_within_tolerance(timestamp, tolerance):
        raise HTTPException(status_code=401, detail="Timestamp outside tolerance")

    # Parse only after the signature check
    payload = None
    if raw_body:
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON")

    event_name = get_event_name(payload)
    if event_name in EVENT_LABELS:
        print(f"{EVENT_LABELS[event_name]}: {payload}")
    else:
        print(f"Unhandled Greenshades event: {event_name or 'unknown'}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
