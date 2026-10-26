# Generated with: 8x8-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison (compare_digest on bytes of equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_8x8_request(headers, config=os.environ) -> bool:
    """8x8 does not sign payloads. The only authentication is the optional HTTP
    Authorization value you set on the webhook, sent back as the Authorization header
    (for example "Bearer 9QQhlsEb8VY" or "Basic dXNlcjpwYXNzd29yZA=="). Compare the WHOLE
    header value, scheme prefix included. Never strip the prefix or base64-decode a Basic
    value.
    """
    expected = config.get("EIGHT_X_EIGHT_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_8x8_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_8x8_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(event: dict) -> None:
    event_type = event.get("eventType")
    p = event.get("payload") or {}

    if event_type == "inbound_message_received":
        sender = p.get("source") or (p.get("user") or {}).get("msisdn")
        print(f"Inbound message {p.get('umid')} from {sender}")
        # TODO: route the reply to your conversation or support system

    elif event_type == "outbound_message_status_changed":
        print(f"Message {p.get('umid')}: {(p.get('status') or {}).get('state')}")
        # TODO: update delivery status (queued, sent, delivered, undelivered, rejected, read)

    elif event_type == "external_app_message":
        print(f"WhatsApp Business App message {p.get('umid')}")

    elif event_type == "short_url_clicked":
        print(f"Short URL clicked: {p.get('shortUrl')} -> {p.get('targetUrl')}")
        # TODO: record the click against the original SMS (p['umid'])

    elif event_type == "template_status_update":
        print(f"Template {(event.get('eventDetails') or {}).get('templateName')} status update")
        # TODO: sync template approval status

    elif event_type in (
        "template_category_update",
        "template_quality_update",
        "template_correct_category_detection",
        "phone_number_quality_update",
        "account_update",
        "whatsapp_automatic_events",
    ):
        print(f"WhatsApp business update: {event_type}")

    else:
        print(f"Unhandled 8x8 event: {event_type}")


@app.post("/webhooks/8x8", dependencies=[Depends(require_8x8_auth)])
async def eight_x_eight_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling 8x8 webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
