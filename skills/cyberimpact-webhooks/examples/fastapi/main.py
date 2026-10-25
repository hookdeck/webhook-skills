# Generated with: cyberimpact-webhooks skill
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
    """Constant-time comparison. Both sides are encoded and hashed, so compare_digest
    gets equal-length bytes (it raises TypeError on non-ASCII str)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_cyberimpact_request(headers, name=None, secret=None) -> bool:
    """Cyberimpact does not sign payloads. The scenario author adds a key-value pair to the
    webhook headers; we compare that header's WHOLE value (no Bearer parsing) with the secret.
    """
    name = name or os.environ.get("CYBERIMPACT_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("CYBERIMPACT_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name.lower())  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_cyberimpact_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_cyberimpact_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "automation.webhook.send":
        print(f"Automation webhook for contact {data.get('id')} ({data.get('email')})")
        # TODO: add/update the contact in your CRM, send an alert, etc.

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/cyberimpact", dependencies=[Depends(require_cyberimpact_credential)])
async def cyberimpact_webhook(request: Request):
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
        print(f"Error handling Cyberimpact event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
