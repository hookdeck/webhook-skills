# Generated with: instagram-webhooks skill
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
    return os.environ.get("INSTAGRAM_APP_SECRET", "")


def get_verify_token() -> str:
    return os.environ.get("INSTAGRAM_VERIFY_TOKEN", "")


def verify_instagram_signature(raw_body: bytes, signature_header: Optional[str], app_secret: str) -> bool:
    """Verify an Instagram (Meta) webhook signature.

    Meta sends ``X-Hub-Signature-256: sha256=<hex>``, the HMAC-SHA256 hex digest
    of the RAW request body keyed with the app secret. The pattern requires
    exactly 64 hex characters (a non-ASCII header simply fails to match, giving
    401 instead of a 500), and the comparison is done on bytes.
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


def handle_change(change: dict, entry: dict) -> None:
    """Field changes: comments, live_comments, mentions, story_insights."""
    field = change.get("field")
    value = change.get("value") or {}

    if field in ("comments", "live_comments"):
        # Instagram Login samples use value.id; Unified/Facebook Login use value.comment_id.
        comment_id = value.get("comment_id") or value.get("id")
        username = (value.get("from") or {}).get("username")
        media_id = (value.get("media") or {}).get("id")
        print(f"{field}: comment {comment_id} by @{username} on media {media_id}")
        # TODO: Moderate or reply to the comment.
    elif field == "mentions":
        # comment_id is present only for a mention in a comment.
        suffix = f" in comment {value['comment_id']}" if value.get("comment_id") else ""
        print(f"Mention on media {value.get('media_id')}{suffix}")
    elif field == "story_insights":
        # Counts under 5 are returned as -1.
        print(f"Story {value.get('media_id')} insights: reach {value.get('reach')}, impressions {value.get('impressions')}")
    else:
        print(f"Unhandled Instagram field: {field} (account {entry.get('id')})")


def handle_messaging_event(event: dict, source: str) -> None:
    """Messaging events: the event is the key present on the item."""
    sender = (event.get("sender") or {}).get("id")

    if "message" in event:
        msg = event.get("message") or {}
        if msg.get("is_echo"):
            print(f"Echo of message {msg.get('mid')} sent by the account to {(event.get('recipient') or {}).get('id')}")
        elif msg.get("is_deleted"):
            print(f"Message {msg.get('mid')} deleted by {sender}")
        elif msg.get("admin_text") and not msg.get("mid"):
            print(f"Handoff notice ({msg.get('handoff_reason') or 'no reason'}) for {sender}")
        else:
            kind = "text" if msg.get("text") else ",".join(a.get("type", "") for a in msg.get("attachments") or [])
            print(f"Message {msg.get('mid')} from {sender} ({kind})")
            # TODO: Reply via the Send API (respond to the webhook first).
    elif "reaction" in event:
        r = event["reaction"] or {}
        print(f"Reaction {r.get('action')} {r.get('reaction') or ''} on {r.get('mid')}")
    elif "postback" in event:
        p = event["postback"] or {}
        print(f"Postback \"{p.get('title')}\" ({p.get('payload')}) from {sender}")
    elif "referral" in event:
        r = event["referral"] or {}
        print(f"Referral ref={r.get('ref')} source={r.get('source')} from {sender}")
    elif "read" in event:
        print(f"Message {(event['read'] or {}).get('mid')} seen by {sender}")
    elif "message_edit" in event:
        e = event["message_edit"] or {}
        print(f"Message {e.get('mid')} edited ({e.get('num_edit')} edits)")
    else:
        print(f"Unhandled Instagram {source} event: {','.join(event.keys())}")


def handle_notification(notification: dict) -> None:
    """Dispatch a notification: { object: 'instagram', entry: [...] }."""
    if notification.get("object") != "instagram":
        print(f"Ignoring object: {notification.get('object')}")
        return

    for entry in notification.get("entry") or []:
        for change in entry.get("changes") or []:
            handle_change(change, entry)
        for event in entry.get("messaging") or []:
            handle_messaging_event(event, "messaging")
        # Handover protocol: events for threads your app doesn't currently own.
        for event in entry.get("standby") or []:
            handle_messaging_event(event, "standby")


@app.get("/webhooks/instagram")
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


@app.post("/webhooks/instagram")
async def receive_webhook(request: Request):
    """POST event delivery: use the raw body for signature verification."""
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature-256")

    if not verify_instagram_signature(raw_body, signature_header, get_app_secret()):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Some Meta samples wrap the notification in an array; accept both forms.
    notifications = payload if isinstance(payload, list) else [payload]
    if not all(isinstance(n, dict) for n in notifications):
        raise HTTPException(status_code=400, detail="Invalid payload")

    for notification in notifications:
        handle_notification(notification)

    return PlainTextResponse(content="EVENT_RECEIVED", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
