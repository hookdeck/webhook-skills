import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# HIPAA deliveries older than this are rejected as replays
HIPAA_MAX_AGE_SECONDS = 300


def verify_chatbase_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Chatbase event webhook signature.

    x-chatbase-signature = hex(HMAC-SHA1(secret, raw_body)) - no prefix, no timestamp.
    """
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8"))


def verify_chatbase_hipaa_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
    now: Optional[float] = None,
) -> Optional[str]:
    """Verify a Chatbase HIPAA conversation webhook signature.

    X-Chatbase-Signature = "v1=" + hex(HMAC-SHA256(secret, timestamp + "." + raw_body))

    Returns None when valid, otherwise an error code.
    """
    if not signature or not timestamp:
        return "missing_headers"
    if not secret:
        return "invalid_signature"

    # Replay protection: the timestamp is signed, but only checking it makes that useful
    if not re.fullmatch(r"\d+", timestamp):
        return "stale_timestamp"
    current = time.time() if now is None else now
    if abs(current - int(timestamp)) > HIPAA_MAX_AGE_SECONDS:
        return "stale_timestamp"

    signed_input = f"{timestamp}.".encode("utf-8") + raw_body
    expected = "v1=" + hmac.new(secret.encode("utf-8"), signed_input, hashlib.sha256).hexdigest()

    # Compare the full string, v1= prefix included
    if not hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8")):
        return "invalid_signature"
    return None


CUSTOM_FORM_SUFFIX = "_custom_form.submit"
COLLECT_DATA_SUFFIX = "_collect_data.submit"


def parse_event_type(event_type) -> dict:
    """Event types with an Action name in them look like
    "{action name}_custom_form.submit" and "{action name}_collect_data.submit"."""
    if event_type in ("leads.submit", "phone_call.summary"):
        return {"kind": event_type}
    if isinstance(event_type, str):
        for suffix in (CUSTOM_FORM_SUFFIX, COLLECT_DATA_SUFFIX):
            if event_type.endswith(suffix) and len(event_type) > len(suffix):
                return {"kind": suffix[1:], "actionName": event_type[: -len(suffix)]}
    return {"kind": "unknown"}


def handle_event(event: dict) -> str:
    event_type = event.get("eventType")
    chatbot_id = event.get("chatbotId")
    payload = event.get("payload") or {}
    parsed = parse_event_type(event_type)
    kind = parsed["kind"]

    if kind == "leads.submit":
        print(f"New lead for agent {chatbot_id}: {payload.get('customerName')} <{payload.get('customerEmail')}>")
        # payload["customFields"] holds custom fields and UTM values when configured
        # TODO: Create the contact in your CRM

    elif kind == "custom_form.submit":
        print(f"Custom form \"{parsed['actionName']}\" submitted in conversation {payload.get('conversationId')}: {payload.get('data')}")
        if payload.get("error"):
            print(f"Attachment upload failed: {payload['error']}")
        # TODO: Store the submission

    elif kind == "collect_data.submit":
        print(f"Collect Data \"{parsed['actionName']}\" submitted in conversation {payload.get('conversationId')}: {payload.get('customFields')}")
        # TODO: Store the collected fields

    elif kind == "phone_call.summary":
        print(
            f"Call from {payload.get('callerNumber')} to {payload.get('calledNumber')} "
            f"({payload.get('duration')}s): {payload.get('callSummary')}"
        )
        # TODO: Log the call against the caller's record

    else:
        print(f"Unhandled Chatbase event: {event_type}")

    return kind


@app.post("/webhooks/chatbase")
async def chatbase_webhook(request: Request):
    secret = os.environ.get("CHATBASE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-chatbase-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing x-chatbase-signature header")

    # Raw body for signature verification - don't parse JSON first
    raw_body = await request.body()
    if not verify_chatbase_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    kind = handle_event(event)
    return {"received": True, "eventType": event.get("eventType"), "kind": kind}


@app.post("/webhooks/chatbase-hipaa")
async def chatbase_hipaa_webhook(request: Request):
    secret = os.environ.get("CHATBASE_HIPAA_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    error = verify_chatbase_hipaa_signature(
        raw_body,
        request.headers.get("x-chatbase-signature"),
        request.headers.get("x-chatbase-timestamp"),
        secret,
    )
    if error:
        # Any non-2xx works; Chatbase's endpoint check requires the forged probe to be rejected
        raise HTTPException(status_code=400, detail=error)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Verification probes carry test: true - acknowledge, never store
    if event.get("test"):
        return {"received": True, "test": True}

    # Deduplicate on deliveryId (also in X-Chatbase-Delivery-Id): delivery is at-least-once
    if event.get("event") == "conversation.deleted":
        conversation = event.get("conversation") or {}
        print(
            f"Conversation {conversation.get('id')} (agent {conversation.get('chatbotId')}) deleted "
            f"({event.get('deletionReason')}), {len(conversation.get('messages') or [])} messages, "
            f"delivery {event.get('deliveryId')}"
        )
        # TODO: Queue the conversation for storage; download attachment downloadUrls within 24 hours
    else:
        print(f"Unhandled Chatbase HIPAA event: {event.get('event')}")

    # Respond quickly - Chatbase times out after 10 seconds
    return {"received": True, "event": event.get("event")}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
