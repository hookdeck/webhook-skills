# Generated with: ayrshare-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Ayrshare Webhook Handler")

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_ayrshare_signature(raw_body: bytes, header: Optional[str], secret: str) -> bool:
    """
    Verify an Ayrshare webhook signature.

    `X-Authorization-Content-SHA256-V2` carries `v1=<hex>`; during the 24 h after a
    secret rotation it carries `v1=<current>,v1=<previous>`. Only the raw body is
    signed (the timestamp header is not), so there is no replay window to check.
    """
    if not header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    matched = False

    for part in header.split(","):
        candidate = part.strip()
        if candidate.startswith("v1="):
            candidate = candidate[3:]
        elif "=" in candidate:
            continue  # entry with some other key: ignore
        # Validate length and alphabet before decoding
        if not HEX_SHA256.fullmatch(candidate):
            continue
        if hmac.compare_digest(bytes.fromhex(candidate), expected):
            matched = True
    return matched


def _str(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


# The payload is verified but still untrusted: check each field's type before use.
def handle_ayrshare_event(event: Dict[str, Any]) -> None:
    action = event.get("action")
    sub_action = _str(event.get("subAction"))

    if action == "scheduled":
        errors = event.get("errors")
        error_count = len(errors) if isinstance(errors, list) else 0
        if sub_action == "tikTokPublished":
            print(f"TikTok post published: {_str(event.get('id'))}")
        else:
            print(f"Scheduled post {_str(event.get('id'))}: {_str(event.get('status'))} ({error_count} errors)")
        # TODO: Update your post record from event["postIds"] / event["errors"]
    elif action == "social":
        print(f"Social account {_str(event.get('type'))} on {_str(event.get('platform'))}")
        # TODO: On "unlink" with source "system", prompt the user to relink
    elif action == "messages":
        details = event.get("senderDetails")
        sender = _str(details.get("name")) if isinstance(details, dict) else None
        print(
            f"Message {sub_action or 'event'} on {_str(event.get('platform'))} "
            f"from {sender or _str(event.get('senderId'))}: {_str(event.get('message')) or ''}"
        )
        # TODO: Store the message; dedupe on id + subAction
    elif action == "comments":
        sender = event.get("from")
        username = _str(sender.get("username")) if isinstance(sender, dict) else None
        print(f"Comment on {_str(event.get('platform'))} by {username}: {_str(event.get('text'))}")
        # TODO: Reply or moderate the comment
    elif action == "ads":
        print(f"Ads event {_str(event.get('type'))} on {_str(event.get('platform')) or 'multiple platforms'}")
    else:
        # mentions, batch, feed, automations, demo, suspended, ...
        print(f"Unhandled Ayrshare action: {_str(action) or 'unknown'}")


@app.post("/webhooks/ayrshare")
async def ayrshare_webhook(request: Request):
    secret = os.getenv("AYRSHARE_WEBHOOK_SECRET")
    if not secret:
        print("AYRSHARE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes, exactly as received: never re-serialize before verifying
    raw_body = await request.body()

    if not verify_ayrshare_signature(
        raw_body, request.headers.get("x-authorization-content-sha256-v2"), secret
    ):
        print("Ayrshare signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # At-least-once delivery: dedupe on event["hookId"] (hold claims for 24 h+)
    print(f"Ayrshare delivery hookId={_str(event.get('hookId'))}")
    handle_ayrshare_event(event)

    # Answer 200 within 15 s; Ayrshare retries 408/425/429 and 5xx, other 4xx are final
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
