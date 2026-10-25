# Generated with: videoask-webhooks skill
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
    """Constant-time comparison (compare_digest on equal-length digests of UTF-8 bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_videoask_request(headers, header_name=None, secret=None) -> bool:
    """VideoAsk does not sign payloads. Authenticate with a header you add in the Connect
    tab ("Add a secret": header name and value) or through the API
    (PUT /forms/{form_id}/webhooks/{tag}, "headers" object). The header name is
    yours; the value is compared whole (no Bearer parsing). This authenticates the
    sender only: no body integrity and no replay protection, so use HTTPS.
    """
    header_name = header_name or os.environ.get("VIDEOASK_WEBHOOK_HEADER") or "secret"
    secret = secret if secret is not None else os.environ.get("VIDEOASK_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name.lower())  # Starlette header lookup is case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_videoask_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_videoask_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("event_type")
    contact = payload.get("contact") or {}
    who = contact.get("email") or contact.get("contact_id")

    if event_type == "form_response":
        print(f"Response received from {who}")
        # TODO: store payload["contact"]["answers"]

    elif event_type == "form_response_transcribed":
        print(f"Response transcribed for {who}")
        # TODO: store transcripts from payload["contact"]["answers"][*]["transcription"]

    elif event_type == "form_author_message":
        print(f"Author message sent to {who}")
        # TODO: log payload["contact"]["messages"]

    elif event_type == "form_contact_message":
        print(f"Contact message from {who}")
        # TODO: notify the team

    # Tag events are listed in VideoAsk's help centre; their payload isn't shown in the docs.
    elif event_type == "form_contact_tagged":
        print(f"Tag added to contact {who}")
        # TODO: sync the contact's tags

    elif event_type == "form_contact_untagged":
        print(f"Tag removed from contact {who}")
        # TODO: sync the contact's tags

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/videoask", dependencies=[Depends(require_videoask_secret)])
async def videoask_webhook(request: Request):
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
        print(f"Error handling VideoAsk event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
