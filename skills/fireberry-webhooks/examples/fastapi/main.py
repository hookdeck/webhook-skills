# Generated with: fireberry-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The automation's author picks the HTTP method, so accept all five Fireberry offers.
METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_fireberry_request(headers, secret=None, header_name=None) -> bool:
    """Fireberry does not sign requests. The webhook automation action sends whatever
    Header key/value pairs you configured, so the header name is user-chosen. Compare
    the WHOLE value (do not strip a "Bearer " prefix). A static shared credential
    authenticates the sender, not the body, and offers no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("FIREBERRY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("FIREBERRY_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_fireberry_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_fireberry_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


# Fireberry adds no event field: the body is free text written by the automation's author.
# This handler assumes an illustrative JSON body such as
#   {"event": "account.created", "record": {"accountname": "Acme"}}
def handle_event(payload: dict) -> None:
    event = payload.get("event")
    record = payload.get("record") or {}

    if event == "account.created":
        print(f"Account created: {record.get('accountname')}")
        # TODO: sync the new account to your system

    elif event == "record.updated":
        print(f"Record updated: {record.get('id')}")
        # TODO: apply the changed fields

    else:
        print(f"Unhandled event: {event}")


@app.api_route(
    "/webhooks/fireberry",
    methods=METHODS,
    dependencies=[Depends(require_fireberry_secret)],
)
async def fireberry_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET requests have no body.
    raw_body = await request.body()
    if not raw_body.strip():
        print(f"{request.method} webhook with empty body")
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Fireberry webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
