# Generated with: smtp2go-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_smtp2go_request(headers, config=os.environ) -> bool:
    """SMTP2GO does not sign payloads. The only credential is the optional Authorization
    header set on the webhook. Compare the WHOLE header value (e.g. "Bearer <token>"),
    scheme prefix included; don't strip, parse or base64-decode it.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    expected = config.get("SMTP2GO_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def parse_body(raw: bytes, content_type: str = "") -> dict:
    """Body is flat JSON or form-encoded depending on the webhook's output type."""
    if "application/x-www-form-urlencoded" in (content_type or "").lower():
        return dict(parse_qsl(raw.decode("utf-8"), keep_blank_values=True))
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Expected an object")
    return payload


async def require_smtp2go_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_smtp2go_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event = payload.get("event")

    if event == "processed":
        print(f"Processed {payload.get('email_id')} for {payload.get('rcpt')}")

    elif event == "delivered":
        print(f"Delivered {payload.get('email_id')} to {payload.get('rcpt')}")
        # TODO: mark the message delivered

    elif event == "open":
        print(f"Opened {payload.get('email_id')} by {payload.get('rcpt')}")

    elif event == "click":
        print(f"Click on {payload.get('email_id')} by {payload.get('rcpt')}")

    elif event == "bounce":
        print(f"Bounce ({payload.get('bounce')}) for {payload.get('rcpt')}: {payload.get('message')}")
        # TODO: suppress the address on hard bounces

    elif event == "spam":
        print(f"Spam complaint from {payload.get('rcpt')}")
        # TODO: remove the address from your lists

    elif event in ("unsubscribe", "resubscribe"):
        print(f"{event} by {payload.get('rcpt')}")
        # TODO: update the recipient's preferences

    elif event == "reject":
        print(f"Rejected {payload.get('email_id')} to {payload.get('rcpt')}")

    elif event in ("sms_sending", "sms_submitted", "sms_delivered", "sms_rejected"):
        print(f"{event}: SMS {payload.get('message_id')} to {payload.get('destination_number')}")

    elif event == "sms_failed":
        print(f"SMS {payload.get('message_id')} to {payload.get('destination_number')} failed ({payload.get('status_code')})")
        # TODO: retry or alert

    else:
        print(f"Unhandled SMTP2GO event: {event}")


@app.post("/webhooks/smtp2go", dependencies=[Depends(require_smtp2go_auth)])
async def smtp2go_webhook(request: Request):
    # Read the raw body so JSON and form-encoded both work.
    raw_body = await request.body()

    try:
        payload = parse_body(raw_body, request.headers.get("content-type", ""))
    except (ValueError, UnicodeDecodeError):  # JSONDecodeError is a ValueError
        raise HTTPException(status_code=400, detail="Invalid JSON or form-encoded body")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling SMTP2GO webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
