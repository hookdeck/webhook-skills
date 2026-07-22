# Generated with: whatsapp-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException

load_dotenv()

app = FastAPI()

APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "")
VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "")


def verify_whatsapp_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    """Verify a WhatsApp (Meta) X-Hub-Signature-256 signature.

    Meta signs the raw request body with HMAC-SHA256 keyed on your app secret and
    sends the lowercase hex digest as ``sha256=<hex>``.
    """
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha256" or not sig:
        return False

    expected = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Timing-safe comparison.
    return hmac.compare_digest(sig, expected)


def handle_whatsapp_event(payload: dict) -> None:
    """Dispatch a verified WhatsApp payload.

    Inbound messages arrive in value["messages"] and outbound status updates in
    value["statuses"], both under the ``messages`` field.
    """
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            field = change.get("field")
            value = change.get("value", {})

            if field == "messages":
                for message in value.get("messages", []):
                    msg_type = message.get("type")
                    print(f"Message {message.get('id')} from {message.get('from')} ({msg_type})")
                    if msg_type == "text":
                        print(f"  Text: {message['text']['body']}")
                        # TODO: reply, route to an agent, etc.
                    elif msg_type in ("image", "audio", "video", "document", "sticker"):
                        print(f"  Media id: {message[msg_type]['id']}")
                        # TODO: download media via the Cloud API using the media id.
                    elif msg_type == "interactive":
                        print(f"  Interactive reply: {message['interactive']}")
                    elif msg_type == "button":
                        print(f"  Button: {message['button']['text']}")
                    elif msg_type == "reaction":
                        print(f"  Reaction: {message['reaction']['emoji']}")
                    elif msg_type == "location":
                        print(f"  Location: {message['location']}")
                    else:
                        print(f"  Unhandled message type: {msg_type}")

                for status in value.get("statuses", []):
                    print(
                        f"Status {status.get('id')}: {status.get('status')} "
                        f"-> {status.get('recipient_id')}"
                    )
                    if status.get("status") == "failed":
                        print(f"  Delivery failed: {status.get('errors')}")
                    # TODO: update your message record's delivery state.
                continue

            # Other subscription fields (templates, account, phone number quality, etc.)
            if field == "message_template_status_update":
                print(f"Template status update: {value.get('event')}")
            elif field == "account_update":
                print(f"Account update: {value.get('event')}")
            elif field == "phone_number_quality_update":
                print(f"Phone number quality update: {value.get('event')}")
            else:
                print(f"Unhandled field: {field}")


@app.get("/webhooks/whatsapp")
async def verify_webhook(request: Request):
    """Meta verification handshake. Echo hub.challenge when the verify token matches."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        # Respond 200 with the raw challenge value (plain text, no JSON).
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@app.post("/webhooks/whatsapp")
async def whatsapp_webhook(request: Request):
    # Read the raw body FIRST — do not parse before verifying (Meta escapes unicode).
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature-256")

    if not verify_whatsapp_signature(raw_body, signature_header, APP_SECRET):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = json.loads(raw_body)

    if payload.get("object") != "whatsapp_business_account":
        return {"received": True, "ignored": True}

    handle_whatsapp_event(payload)

    # Acknowledge quickly; do heavy work asynchronously.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
