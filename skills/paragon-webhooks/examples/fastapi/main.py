# Generated with: paragon-webhooks skill
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
    """Constant-time comparison: compare_digest on bytes (both sides encoded, never str,
    which raises on non-ASCII), here via equal-length SHA-256 digests."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_paragon_request(headers, secret=None, header_name=None) -> bool:
    """Paragon does not sign Webhook Destination requests. You add a header (name and
    value are yours to choose) under "Show more request options". We compare the WHOLE
    header value with PARAGON_WEBHOOK_SECRET: a "Bearer " prefix is not parsed or stripped.
    The header name is looked up case-insensitively.
    """
    secret = secret if secret is not None else os.environ.get("PARAGON_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PARAGON_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    wanted = header_name.lower()
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return bool(received) and safe_equal(received, secret)


async def require_paragon_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_paragon_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    event_type = payload.get("type")
    message = payload.get("message")

    if event_type == "workflow_failure":
        print(f"Workflow failed: {message}")
        # TODO: alert the team (payload["workflow"], payload["user"], payload["data"]["error"], payload["data"]["executionUrl"])

    elif event_type == "credentials_failure":
        print(f"Credential failed: {message}")
        # TODO: ask payload["user"]["id"] to reconnect payload["integration"]["type"] in your Connect Portal

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/paragon", dependencies=[Depends(require_paragon_credential)])
async def paragon_webhook(request: Request):
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
        print(f"Error handling Paragon event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
