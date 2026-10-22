# Generated with: iterable-webhooks skill
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
    """Constant-time comparison: compare_digest on bytes (equal-length SHA-256 digests).
    Never pass str to compare_digest: it raises TypeError on non-ASCII input."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_iterable_request(headers, config=os.environ) -> bool:
    """Iterable does not sign payloads. The only authentication is the Authorization
    header ("Bearer <token>" for OAuth 2.0, or exactly the string typed in Authentication
    Token for Basic, e.g. "Basic abc123"). Compare the WHOLE value, prefix included; never
    strip the prefix and never base64-decode a Basic value.
    """
    expected = config.get("ITERABLE_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_iterable_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_iterable_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event_name = payload.get("eventName")
    email = payload.get("email")
    data = payload.get("dataFields") or {}

    if event_name == "emailSend":
        print(f"Email sent to {email}: {data.get('emailSubject')}")
        # TODO: record the send against campaignId / messageId

    elif event_name == "emailOpen":
        print(f"Email opened by {email} (campaign {data.get('campaignId')})")
        # TODO: record the open (check dataFields.isBot / proxySource)

    elif event_name == "emailClick":
        print(f"Email link clicked by {email}: {data.get('url')}")
        # TODO: record the click

    elif event_name == "emailBounce":
        print(f"Email bounced for {email}: {data.get('recipientState')}")
        # TODO: suppress the address on HardBounce

    elif event_name == "emailComplaint":
        print(f"Spam complaint from {email}")
        # TODO: suppress the address

    elif event_name == "emailUnSubscribe":  # note the capital S: the exact name Iterable sends
        print(f"Unsubscribe from {email}: {data.get('unsubSource')}")
        # TODO: update the user's marketing preferences

    elif event_name == "smsSend":
        print(f"SMS sent to {email or payload.get('userId')}")

    elif event_name == "pushSend":
        print(f"Push sent to {email or payload.get('userId')}")

    elif event_name == "inAppOpen":
        print(f"In-app message opened by {email or payload.get('userId')}")

    else:
        print(f"Unhandled Iterable event: {event_name}")


@app.post("/webhooks/iterable", dependencies=[Depends(require_iterable_auth)])
async def iterable_webhook(request: Request):
    # Read the raw body so any content type works.
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
        print(f"Error handling Iterable webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
