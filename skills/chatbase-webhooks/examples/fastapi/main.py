import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# x-chatbase-signature is 40 hex characters: hex(HMAC-SHA1(secret, raw_body))
SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{40}")


def verify_chatbase_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Chatbase Action webhook signature.

    x-chatbase-signature = hex(HMAC-SHA1(secret, raw_body)) - no prefix, no timestamp.
    The value must be exactly 40 hex characters. Hex is compared case-insensitively,
    in constant time.
    """
    if not signature or not secret or not SIGNATURE_PATTERN.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


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
    """Payloads carry names, emails, phone numbers and call summaries: log ids only."""
    event_type = event.get("eventType")
    chatbot_id = event.get("chatbotId")
    payload = event.get("payload") or {}
    parsed = parse_event_type(event_type)
    kind = parsed["kind"]

    if kind == "leads.submit":
        print(f"leads.submit for agent {chatbot_id}, conversation {payload.get('conversationId')}")
        # Your code: create or update the contact in your CRM.
        # payload["customFields"] holds custom fields and UTM values when configured.

    elif kind == "custom_form.submit":
        print(f"Custom form \"{parsed['actionName']}\" submitted in conversation {payload.get('conversationId')}")
        if payload.get("error"):
            print(f"Custom form \"{parsed['actionName']}\": attachment upload failed")
        # Your code: store payload["data"], the submitted fields keyed by field name.

    elif kind == "collect_data.submit":
        print(f"Collect Data \"{parsed['actionName']}\" submitted in conversation {payload.get('conversationId')}")
        # Your code: store payload["customFields"].

    elif kind == "phone_call.summary":
        print(f"phone_call.summary for conversation {payload.get('conversationId')} ({payload.get('duration')}s)")
        # Your code: attach payload["callSummary"] to the caller's record.

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


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
