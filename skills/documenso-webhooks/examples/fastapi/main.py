# Generated with: documenso-webhooks skill
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
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_documenso_secret(received_secret, expected_secret=None) -> bool:
    """Documenso does not sign the payload. It sends the webhook secret you
    configured as plain text in the X-Documenso-Secret header (an empty string when
    no secret is set). Reject an unconfigured secret and an empty header, then
    compare in constant time."""
    if expected_secret is None:
        expected_secret = os.environ.get("DOCUMENSO_WEBHOOK_SECRET")
    if not expected_secret:
        return False  # never accept requests when no secret is configured
    if not received_secret:
        return False  # empty header = webhook created without a secret
    return safe_equal(received_secret, expected_secret)


async def require_documenso_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_documenso_secret(request.headers.get("x-documenso-secret")):
        raise HTTPException(status_code=401, detail="Unauthorized")


def handle_event(body: dict) -> None:
    event = body.get("event")
    payload = body.get("payload") or {}
    title = payload.get("title")

    if event == "DOCUMENT_CREATED":
        print(f"Document created: {title} ({payload.get('envelopeId')})")

    elif event == "DOCUMENT_SENT":
        print(f"Document sent: {title}")

    elif event == "DOCUMENT_OPENED":
        print(f"Document opened: {title}")

    elif event == "DOCUMENT_SIGNED":
        print(f"Document signed: {title}")
        # TODO: update the signer's status in your database

    elif event == "DOCUMENT_RECIPIENT_COMPLETED":
        print(f"Recipient completed: {title}")

    elif event == "DOCUMENT_COMPLETED":
        print(f"Document completed: {title}")
        # TODO: fetch the signed PDF and archive it

    elif event == "DOCUMENT_REJECTED":
        print(f"Document rejected: {title}")
        # TODO: notify the document owner

    elif event == "DOCUMENT_CANCELLED":
        print(f"Document cancelled: {title}")

    elif event == "DOCUMENT_REMINDER_SENT":
        print(f"Reminder sent: {title}")

    elif event == "RECIPIENT_EXPIRED":
        print(f"Recipient signing deadline passed: {title}")

    elif event in ("TEMPLATE_CREATED", "TEMPLATE_UPDATED", "TEMPLATE_DELETED", "TEMPLATE_USED"):
        print(f"Template event {event}: {title}")

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/documenso", dependencies=[Depends(require_documenso_secret)])
async def documenso_webhook(request: Request):
    raw_body = await request.body()

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Documenso event: {err}")
        # A non-2xx makes Documenso retry the delivery.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
