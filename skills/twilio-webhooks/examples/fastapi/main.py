# Generated with: twilio-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException
from twilio.request_validator import RequestValidator

load_dotenv()

app = FastAPI()


def _validator() -> RequestValidator:
    """Build the RequestValidator on each call so tests can monkeypatch TWILIO_AUTH_TOKEN."""
    return RequestValidator(os.environ.get("TWILIO_AUTH_TOKEN", ""))


def build_webhook_url(request: Request) -> str:
    """
    Reconstruct the URL Twilio signed.

    Twilio computes the signature over the exact URL you registered. Behind a
    proxy, the request URL FastAPI sees may differ — prefer an explicit base.
    """
    base = os.environ.get("WEBHOOK_BASE_URL")
    if base:
        path = request.url.path
        query = request.url.query
        path_and_query = f"{path}?{query}" if query else path
        return base.rstrip("/") + path_and_query

    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_proto and forwarded_host:
        path = request.url.path
        query = request.url.query
        path_and_query = f"{path}?{query}" if query else path
        return f"{forwarded_proto}://{forwarded_host}{path_and_query}"

    return str(request.url)


def verify_twilio_webhook(
    auth_token: str,
    signature: str,
    url: str,
    params: dict,
) -> bool:
    """Verify an X-Twilio-Signature for a form-encoded webhook using the Twilio SDK."""
    if not signature:
        return False
    try:
        return RequestValidator(auth_token).validate(url, params, signature)
    except Exception:
        return False


@app.post("/webhooks/twilio")
async def twilio_webhook(request: Request):
    form = await request.form()
    params = {key: form[key] for key in form}

    signature = request.headers.get("X-Twilio-Signature", "")
    url = build_webhook_url(request)

    if not _validator().validate(url, params, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    # Twilio doesn't put an event field in the body — route by parameter shape
    # and (for voice) by Direction.

    # Incoming SMS / MMS -> respond with TwiML
    if params.get("MessageSid") and "Body" in params and "MessageStatus" not in params:
        return _handle_incoming_sms(params)

    # Message status callback: queued, sending, sent, delivered, undelivered, failed
    if params.get("MessageSid") and params.get("MessageStatus"):
        _handle_message_status(params)
        return Response(status_code=204)

    # Incoming voice call -> respond with TwiML
    if params.get("CallSid") and params.get("Direction") == "inbound" and "Body" not in params:
        return _handle_incoming_call(params)

    # Call status callback: queued, ringing, in-progress, completed, busy, failed, no-answer, canceled
    if params.get("CallSid") and params.get("CallStatus"):
        _handle_call_status(params)
        return Response(status_code=204)

    # Recording status callback
    if params.get("RecordingSid") and params.get("RecordingStatus"):
        _handle_recording_status(params)
        return Response(status_code=204)

    print(f"Unhandled Twilio webhook params: {list(params.keys())}")
    return Response(status_code=204)


def _handle_incoming_sms(params: dict) -> Response:
    print(f"Incoming SMS {params['MessageSid']} from {params.get('From')}: {params.get('Body')}")
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Message>Thanks, got your message!</Message></Response>"
    )
    return Response(content=twiml, media_type="text/xml")


def _handle_incoming_call(params: dict) -> Response:
    print(f"Incoming call {params['CallSid']} from {params.get('From')}")
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Say>Hello from Twilio webhooks.</Say></Response>"
    )
    return Response(content=twiml, media_type="text/xml")


def _handle_message_status(params: dict) -> None:
    status = params["MessageStatus"]
    print(f"Message {params['MessageSid']} status: {status}")
    if status in ("failed", "undelivered"):
        print(f"  delivery problem ErrorCode={params.get('ErrorCode')}")


def _handle_call_status(params: dict) -> None:
    print(f"Call {params['CallSid']} status: {params['CallStatus']}")
    # Statuses: queued, ringing, in-progress, completed, busy, failed, no-answer, canceled


def _handle_recording_status(params: dict) -> None:
    print(f"Recording {params['RecordingSid']} status: {params['RecordingStatus']}")
    # Statuses: in-progress, completed, absent


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 3000)))
