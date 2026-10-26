# Generated with: onespan-webhooks skill
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
    """Constant-time comparison: compare_digest on bytes (never str, which raises on
    non-ASCII). Hashing both sides first also hides the credential's length."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_onespan_request(headers, config=os.environ) -> bool:
    """OneSpan Sign does not sign payloads. The callback key you registered is sent as
    `Authorization: Basic {callbackKey}`: the raw key, NOT base64(user:pass), so don't
    decode it as HTTP Basic. Compare the complete header value, including the "Basic "
    prefix, with ONESPAN_AUTHORIZATION.
    """
    expected = config.get("ONESPAN_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_onespan_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_onespan_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    # The event type is the `name` field of the JSON body.
    name = payload.get("name")

    if name == "PACKAGE_CREATE":
        print(f"Package created: {payload.get('packageId')}")
        # TODO: store OneSpan's package ID next to your own transaction ID

    elif name == "PACKAGE_ACTIVATE":
        print(f"Package sent to signers: {payload.get('packageId')}")

    elif name == "DOCUMENT_SIGNED":
        print(f"Document {payload.get('documentId')} signed by {payload.get('sessionUser')} in {payload.get('packageId')}")
        # TODO: record per-document progress

    elif name == "SIGNER_COMPLETE":
        print(f"Signer {payload.get('sessionUser')} completed package {payload.get('packageId')}")

    elif name == "PACKAGE_COMPLETE":
        print(f"Package complete: {payload.get('packageId')}")
        # TODO: queue a job that downloads the signed documents by packageId

    elif name == "PACKAGE_DECLINE":
        print(f"Package {payload.get('packageId')} declined: {payload.get('message')}")
        # TODO: decide the next step from the decline reason

    elif name == "EMAIL_BOUNCE":
        print(f"Email bounced for {payload.get('packageId')}: {payload.get('message')}")

    else:
        print(f"Unhandled OneSpan event: {name}")


@app.post("/webhooks/onespan", dependencies=[Depends(require_onespan_auth)])
async def onespan_webhook(request: Request):
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
        print(f"Error handling OneSpan webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
