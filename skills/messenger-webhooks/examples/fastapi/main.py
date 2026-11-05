# Generated with: messenger-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import re
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()

SIGNATURE_PATTERN = re.compile(r"sha256=([0-9a-fA-F]{64})")


def get_app_secret() -> str:
    return os.environ.get("MESSENGER_APP_SECRET", "")


def get_verify_token() -> str:
    return os.environ.get("MESSENGER_VERIFY_TOKEN", "")


def verify_messenger_signature(raw_body: bytes, signature_header: Optional[str], app_secret: str) -> bool:
    """Verify a Facebook Messenger (Meta) webhook signature.

    Meta sends ``X-Hub-Signature-256: sha256=<hex>``, the HMAC-SHA256 hex digest
    of the request body keyed with the App Secret. Meta signs the escaped-unicode
    payload, so the HMAC runs over the RAW bytes as received (never a
    re-serialized copy). The pattern requires exactly 64 hex characters (a
    non-ASCII header simply fails to match, giving 401 instead of a 500), and the
    comparison is done on bytes.
    """
    if not signature_header or not app_secret:
        return False

    match = SIGNATURE_PATTERN.fullmatch(signature_header)
    if not match:
        return False

    expected = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    return hmac.compare_digest(
        match.group(1).lower().encode("ascii"),
        expected.encode("ascii"),
    )


def event_type(event: dict) -> str:
    """Name the Messenger field an item belongs to (one event key per item)."""
    if "message" in event:
        return "message_echoes" if (event.get("message") or {}).get("is_echo") else "messages"
    for key, field in (
        ("postback", "messaging_postbacks"),
        ("read", "message_reads"),
        ("delivery", "message_deliveries"),
        ("reaction", "message_reactions"),
        ("optin", "messaging_optins"),
        ("referral", "messaging_referrals"),
        ("message_edit", "message_edits"),
        ("account_linking", "messaging_account_linking"),
    ):
        if key in event:
            return field
    return "unknown"


def handle_messaging_event(event: dict, channel: str) -> None:
    sender = event.get("sender") or {}
    psid = sender.get("id") or sender.get("user_ref")
    kind = event_type(event)

    if kind == "messages":
        msg = event.get("message") or {}
        if msg.get("admin_text") and not msg.get("mid"):
            print(f"Handoff notice ({msg.get('handoff_reason') or 'no reason'}) for {psid}")
        elif msg.get("quick_reply"):
            print(f"Quick reply {msg['quick_reply'].get('payload')} from {psid}")
        else:
            content = "text" if msg.get("text") else ",".join(a.get("type", "") for a in msg.get("attachments") or [])
            print(f"Message {msg.get('mid')} from {psid} ({content})")
        # TODO: Reply via the Send API. Respond 200 first: Meta expects it within 5s.
    elif kind == "message_echoes":
        msg = event["message"]
        print(f"Echo of {msg.get('mid')} sent by app {msg.get('app_id')} to {(event.get('recipient') or {}).get('id')}")
    elif kind == "messaging_postbacks":
        p = event["postback"] or {}
        print(f"Postback \"{p.get('title')}\" ({p.get('payload')}) from {psid}")
    elif kind == "message_reads":
        print(f"{psid} read messages up to {(event['read'] or {}).get('watermark')}")
    elif kind == "message_deliveries":
        d = event["delivery"] or {}
        print(f"Delivered up to {d.get('watermark')} ({len(d.get('mids') or [])} mids)")
    elif kind == "message_reactions":
        r = event["reaction"] or {}
        print(f"Reaction {r.get('action')} {r.get('reaction') or ''} on {r.get('mid')}")
    elif kind == "messaging_optins":
        print(f"Opt-in {(event['optin'] or {}).get('type') or 'plugin'} from {psid}")
        # TODO: Store optin.notification_messages_token for Marketing Messages.
    elif kind == "messaging_referrals":
        r = event["referral"] or {}
        print(f"Referral ref={r.get('ref')} source={r.get('source')} from {psid}")
    elif kind == "message_edits":
        e = event["message_edit"] or {}
        print(f"Message {e.get('mid')} edited ({e.get('num_edit')} edits)")
    elif kind == "messaging_account_linking":
        print(f"Account {(event['account_linking'] or {}).get('status')} for {psid}")
    else:
        print(f"Unhandled Messenger {channel} event: {','.join(event.keys())}")


def handle_notification(notification: dict) -> None:
    """Dispatch a notification: { object: 'page', entry: [{ messaging: [...] }] }."""
    if notification.get("object") != "page":
        # Instagram messaging arrives as object "instagram": see instagram-webhooks.
        print(f"Ignoring object: {notification.get('object')}")
        return

    for entry in notification.get("entry") or []:
        for event in entry.get("messaging") or []:
            handle_messaging_event(event, "messaging")
        # Handover protocol: events for threads your app doesn't currently own.
        for event in entry.get("standby") or []:
            handle_messaging_event(event, "standby")


@app.get("/webhooks/messenger")
async def verify_webhook(request: Request):
    """GET verification handshake: Meta sends this when the Callback URL is configured."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    verify_token = get_verify_token()
    if (
        mode == "subscribe"
        and token
        and verify_token
        and hmac.compare_digest(token.encode("utf-8"), verify_token.encode("utf-8"))
    ):
        # Echo the challenge back verbatim as plain text.
        return PlainTextResponse(content=challenge or "", status_code=200)

    raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/webhooks/messenger")
async def receive_webhook(request: Request):
    """POST event delivery: use the raw body for signature verification."""
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature-256")

    if not verify_messenger_signature(raw_body, signature_header, get_app_secret()):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification.
    try:
        notification = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(notification, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    handle_notification(notification)

    return PlainTextResponse(content="EVENT_RECEIVED", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
