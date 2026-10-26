# Generated with: baserow-webhooks skill
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
    """Constant-time string comparison. Both sides are encoded to bytes first
    (compare_digest raises TypeError on non-ASCII str) and hashed to equal length."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_baserow_request(headers, name=None, secret=None) -> bool:
    """Baserow does not sign payloads. You add a secret custom header to the webhook; the header
    name is yours to choose (BASEROW_WEBHOOK_HEADER, default 'Authorization') and the expected
    value is the exact, whole header value (BASEROW_WEBHOOK_SECRET), including any 'Bearer '
    prefix you typed. Do not strip or parse a prefix.
    """
    name = name or os.environ.get("BASEROW_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("BASEROW_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name.lower())  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_baserow_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_baserow_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("event_type")
    event_id = payload.get("event_id")

    if event_type == "rows.created":
        print(f"Rows created ({event_id}): {len(payload.get('items') or [])} row(s)")
        # TODO: sync payload["items"] to your system

    elif event_type == "rows.updated":
        print(f"Rows updated ({event_id}): {len(payload.get('items') or [])} row(s)")
        # TODO: apply payload["items"] changes

    elif event_type == "rows.deleted":
        print(f"Rows deleted ({event_id})")
        # TODO: remove the rows downstream

    elif event_type in ("view.created", "view.updated", "view.deleted"):
        print(f"View event {event_type} ({event_id})")
        # TODO: audit the schema change (payload["view"])

    elif event_type in ("field.created", "field.updated", "field.deleted"):
        print(f"Field event {event_type} ({event_id})")
        # TODO: update your schema mirror (payload["field"])

    else:
        print(f"Unhandled event: {event_type}")


# The sender chooses the method in Baserow, so accept all of them (a JSON body is sent even on GET).
@app.api_route(
    "/webhooks/baserow",
    methods=["POST", "PUT", "PATCH", "GET", "DELETE"],
    dependencies=[Depends(require_baserow_secret)],
)
async def baserow_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    if not raw_body.strip():
        # Empty body: nothing to dispatch.
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
        print(f"Error handling Baserow event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
