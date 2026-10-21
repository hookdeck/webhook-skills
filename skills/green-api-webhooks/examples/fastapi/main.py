# Generated with: green-api-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def expected_authorization(token: str) -> str:
    """GREEN-API sends the configured webhookUrlToken as the FULL Authorization
    header value: "Bearer <token>" (default) or "Basic <token>". A bare token
    means "Bearer"."""
    return token if re.match(r"^(Bearer|Basic) ", token) else f"Bearer {token}"


def verify_green_api_authorization(header_value: str | None, token: str | None) -> bool:
    """GREEN-API webhooks are not signed (no HMAC). Constant-time compare the
    whole Authorization header, scheme included."""
    if not header_value or not token:
        return False
    # compare_digest is constant-time and safe for unequal lengths.
    return hmac.compare_digest(header_value.encode(), expected_authorization(token).encode())


async def require_green_api_authorization(
    authorization: str | None = Header(default=None),
) -> None:
    """FastAPI dependency: reject the request before the handler runs."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not verify_green_api_authorization(authorization, os.environ.get("GREEN_API_WEBHOOK_URL_TOKEN")):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")


def handle_notification(body: dict) -> None:
    """Dispatch on typeWebhook. GREEN-API retries undelivered notifications every
    minute for up to 24 hours, so make these handlers idempotent (e.g. dedupe on
    idMessage)."""
    type_webhook = body.get("typeWebhook")
    sender_data = body.get("senderData") or {}
    instance_data = body.get("instanceData") or {}

    if type_webhook == "incomingMessageReceived":
        message_data = body.get("messageData") or {}
        text = (message_data.get("textMessageData") or {}).get("textMessage")
        suffix = f": {text}" if text else ""
        print(f"Incoming {message_data.get('typeMessage')} {body.get('idMessage')} from {sender_data.get('chatId')}{suffix}")
        # TODO: route to your bot / inbox, auto-reply, etc.

    elif type_webhook == "outgoingMessageReceived":
        print(f"Message {body.get('idMessage')} sent from phone to {sender_data.get('chatId')}")
        # TODO: sync conversations sent outside your app

    elif type_webhook == "outgoingAPIMessageReceived":
        print(f"Message {body.get('idMessage')} sent via API to {sender_data.get('chatId')}")
        # TODO: log/audit API sends

    elif type_webhook == "outgoingMessageStatus":
        print(f"Message {body.get('idMessage')} to {body.get('chatId')} is {body.get('status')}")
        # TODO: update delivery/read status; handle "failed" and "noAccount" (always sent)

    elif type_webhook == "stateInstanceChanged":
        print(f"Instance {instance_data.get('idInstance')} state: {body.get('stateInstance')}")
        # TODO: alert when notAuthorized or blocked

    elif type_webhook == "statusInstanceChanged":
        print(f"Instance {instance_data.get('idInstance')} socket: {body.get('statusInstance')}")

    elif type_webhook == "incomingCall":
        print(f"Incoming call {body.get('idMessage')} from {body.get('from')}")
        # TODO: missed-call auto-reply

    else:
        print(f"Unhandled typeWebhook: {type_webhook}")


@app.post("/webhooks/green-api", dependencies=[Depends(require_green_api_authorization)])
async def green_api_webhook(request: Request):
    try:
        body = json.loads(await request.body())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(body, dict) or not isinstance(body.get("typeWebhook"), str):
        raise HTTPException(status_code=400, detail="Missing typeWebhook")

    try:
        handle_notification(body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling notification: {err}")
        # Non-2xx makes GREEN-API retry in a minute.
        raise HTTPException(status_code=500, detail="Processing error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
