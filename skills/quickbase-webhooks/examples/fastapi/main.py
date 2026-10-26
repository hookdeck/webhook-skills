# Generated with: quickbase-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_quickbase_request(headers, secret=None, header_name=None) -> bool:
    """Quickbase does not sign webhooks. You add a secret header in the webhook's Message header
    list; the header name is yours (QUICKBASE_WEBHOOK_HEADER, default Authorization) and the
    expected value is the exact, whole header value (QUICKBASE_WEBHOOK_SECRET), including any
    "Bearer " prefix. Never strip or parse a prefix: compare the whole value.

    This authenticates the sender, not the body, and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("QUICKBASE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("QUICKBASE_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if received is None:
        return False
    # compare_digest needs bytes (str raises TypeError on non-ASCII). Starlette decodes header
    # bytes as latin-1, so re-encode as latin-1 to recover the bytes that were sent.
    return hmac.compare_digest(received.encode("latin-1"), secret.encode("utf-8"))


async def require_quickbase_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read or parsed."""
    if not verify_quickbase_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    """Quickbase adds no event field. `event` is ILLUSTRATIVE: a literal you type into your
    message body template (one webhook per trigger), not something Quickbase sends."""
    event = payload.get("event")

    if event == "record_added":
        print(f"Record added: {payload.get('record_id')}")
        # TODO: create the record in your system

    elif event == "record_modified":
        print(f"Record modified: {payload.get('record_id')}")
        # TODO: update the record in your system

    elif event == "record_deleted":
        print(f"Record deleted: {payload.get('record_id')}")
        # TODO: remove the record from your system

    else:
        print("Unrecognized Quickbase payload; acknowledging")


def parse_body(raw_body: bytes):
    """Parse only after authentication. Accepts JSON, XML, RAW text or nothing."""
    if not raw_body.strip():
        return None  # empty body (e.g. GET or DELETE)
    try:
        parsed = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None  # XML or RAW: nothing to dispatch on
    return parsed if isinstance(parsed, dict) else None


# The HTTP method is chosen in the Quickbase webhook (POST is the default), so accept all five.
@app.api_route(
    "/webhooks/quickbase",
    methods=["POST", "PUT", "PATCH", "GET", "DELETE"],
    dependencies=[Depends(require_quickbase_secret)],
)
async def quickbase_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = parse_body(raw_body)
        if payload is not None:
            handle_event(payload)
        else:
            print(f"Quickbase {request.method} with {len(raw_body)} byte non-JSON/empty body")
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Quickbase webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
