# Generated with: postscript-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_postscript_request(headers, token=None) -> bool:
    """Postscript does not sign payloads. The Postscript-Signature header carries the
    account's webhook signing token (from GET /api/v2/webhooks/token) as plain text,
    so the whole header value is compared with the stored token. This authenticates
    the sender, not the body, and gives no replay protection: use HTTPS and keep
    the token secret (the docs call it fixed and document no rotation).
    """
    token = token if token is not None else os.environ.get("POSTSCRIPT_WEBHOOK_TOKEN")
    if not token:
        return False  # never accept when unconfigured
    received = headers.get("postscript-signature")
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), token.encode("utf-8"))


async def require_postscript_signature(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_postscript_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Postscript-Signature")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    data = payload.get("event_data") or {}

    if event == "shop.incoming_message":
        print(f"Incoming message from {data.get('from_number')}: {data.get('body')}")
        # TODO: route to support or reply via the Send Message API

    elif event == "shop.subscriber.opt_in":
        print(f"Subscriber opted in: {data.get('id') or data.get('subscriber_id')}")
        # TODO: sync the subscriber to your CRM

    elif event == "shop.subscriber.opt_out":
        print(f"Subscriber opted out: {data.get('id') or data.get('subscriber_id')}")
        # TODO: suppress the subscriber in other channels

    elif event == "shop.email_collected":
        print(f"Email collected: {data.get('email')}")
        # TODO: add the email to your list

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/postscript", dependencies=[Depends(require_postscript_signature)])
async def postscript_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Postscript event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
