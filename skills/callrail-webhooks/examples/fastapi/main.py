import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Event names match the keys of the webhook integration `config` object
# (minus the `_webhook` suffix), e.g. `post_call_webhook` -> `post_call`.
KNOWN_EVENTS = {
    "pre_call",
    "answered_call",
    "post_call",
    "updated_call",
    "post_outbound_call",
    "updated_outbound_call",
    "sms_received",
    "sms_sent",
    "form_captured",
    "convert_assist_complete",
}


def verify_callrail_signature(
    raw_body: bytes, signature: Optional[str], signing_key: Optional[str]
) -> bool:
    """Verify a CallRail webhook signature.

    CallRail sends `Signature` = base64(HMAC-SHA1(companySigningKey, rawBody)).
    The key is used as a plain string (not hex-decoded).
    """
    if not signature or not signing_key:
        return False

    digest = hmac.new(signing_key.encode("utf-8"), raw_body, hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("ascii")
    # Timing-safe comparison (compare_digest accepts different lengths)
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("ascii"))


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    try:
        # fromisoformat only accepts "Z" from Python 3.11
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_timestamp_fresh(
    payload: Dict[str, Any],
    tolerance_seconds: float,
    now: Optional[datetime] = None,
) -> bool:
    """Optional replay check using the timestamp inside the body.

    Uses `timestamp`, or `submitted_at` for form submissions.
    A tolerance of 0 disables the check.
    """
    if not tolerance_seconds or tolerance_seconds <= 0:
        return True
    sent_at = _parse_timestamp(payload.get("timestamp") or payload.get("submitted_at"))
    if sent_at is None or sent_at.tzinfo is None:
        return False
    now = now or datetime.now(timezone.utc)
    return abs((now - sent_at).total_seconds()) <= tolerance_seconds


def classify_callrail_event(payload: Dict[str, Any], hint: Optional[str] = None) -> str:
    """CallRail does not put an event type in the body or a header.

    The event is whichever webhook URL you registered, so either add
    `?callrail_event=<name>` to the URL, or fall back to inferring it from
    the payload shape.
    """
    if hint and hint in KNOWN_EVENTS:
        return hint
    if isinstance(payload.get("changes"), list):
        return "updated_outbound_call" if payload.get("direction") == "outbound" else "updated_call"
    if payload.get("form_data"):
        return "form_captured"
    if payload.get("answers") and payload.get("last_interaction_resource_id"):
        return "convert_assist_complete"
    if payload.get("source_number") and payload.get("destination_number") and "content" in payload:
        return "sms_sent" if "agent" in payload else "sms_received"
    if "call_type" in payload or "customer_phone_number" in payload:
        # Pre-call, call routing complete and post-call share one call object
        return "post_outbound_call" if payload.get("direction") == "outbound" else "call"
    return "unknown"


def handle_callrail_event(event: str, payload: Dict[str, Any]) -> None:
    if event == "pre_call":
        print(f"Incoming call from {payload.get('customer_phone_number')} to {payload.get('tracking_phone_number')}")
        # TODO: Screen-pop or CRM lookup (respond quickly, the call is still ringing)
    elif event == "answered_call":
        print(f"Call {payload.get('id')} routed")
        # TODO: Update the agent's live view
    elif event in ("post_call", "post_outbound_call"):
        print(f"Call {payload.get('id')} finished ({payload.get('duration')}s, answered={payload.get('answered')})")
        # TODO: Store the call, recording and transcription
    elif event in ("updated_call", "updated_outbound_call"):
        print(f"Call {payload.get('id')} modified: {', '.join(payload.get('changes', []))}")
        # TODO: Refresh tags, notes, value, transcription or call summary
    elif event == "sms_received":
        print(f"Text received from {payload.get('source_number')}: {payload.get('content')}")
        # TODO: Route the message to your inbox or CRM
    elif event == "sms_sent":
        print(f"Text sent by {payload.get('agent')} to {payload.get('destination_number')}")
        # TODO: Log the outbound message
    elif event == "form_captured":
        print(f"Form submission {payload.get('id')} from {payload.get('form_url')}")
        # TODO: Create a lead from payload["form_data"]
    elif event == "convert_assist_complete":
        print(f"Convert Assist finished for {payload.get('person_resource_id')}")
        # TODO: Store payload["answers"]
    elif event == "call":
        # Inbound call object (pre-call, call routing complete or post-call).
        # Add ?callrail_event=<name> to each webhook URL to tell them apart.
        print(f"Call event for {payload.get('id')}")
    else:
        print("Unhandled CallRail webhook payload")


@app.post("/webhooks/callrail")
async def callrail_webhook(request: Request):
    signing_key = os.getenv("CALLRAIL_SIGNING_KEY")
    if not signing_key:
        print("CALLRAIL_SIGNING_KEY is not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Signature header")

    # Raw body for signature verification - don't use request.json() first
    raw_body = await request.body()
    if not verify_callrail_signature(raw_body, signature, signing_key):
        print("CallRail webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    tolerance = float(os.getenv("CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS") or 0)
    if not is_timestamp_fresh(payload, tolerance):
        raise HTTPException(status_code=400, detail="Timestamp outside tolerance")

    event = classify_callrail_event(payload, request.query_params.get("callrail_event"))
    # CallRail does not resend failed webhooks: respond 2xx quickly and
    # de-duplicate on payload["id"] / payload["resource_id"] if you process async.
    handle_callrail_event(event, payload)

    return {"received": True, "event": event}


@app.get("/health")
async def health():
    return {"status": "ok"}
