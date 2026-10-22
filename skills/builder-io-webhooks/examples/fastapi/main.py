# Generated with: builder-io-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Both sides are encoded to bytes: compare_digest raises
    TypeError on a non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_builder_request(headers, header=None, secret=None) -> bool:
    """Builder.io does not sign webhooks. Authenticate with the secret custom header you added to
    the webhook. The header name is yours to choose; the secret is the exact, whole header value
    (including any "Bearer " prefix). A static credential authenticates the sender, not the body,
    and gives no replay protection: use HTTPS and rotate it if it leaks.
    """
    header = header or os.environ.get("BUILDER_IO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("BUILDER_IO_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_builder_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_builder_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    operation = payload.get("operation")
    model_name = payload.get("modelName")
    new_value = payload.get("newValue") or {}
    previous_value = payload.get("previousValue") or {}

    if operation == "publish":
        first = " (first publish)" if not previous_value else ""
        print(f"Published {model_name}: {new_value.get('id')}{first}")
        # TODO: sync new_value to your database or bust the CDN cache

    elif operation == "unpublish":
        print(f"Unpublished {model_name}: {new_value.get('id')}")
        # TODO: remove the entry from search or a CDN

    elif operation == "archive":
        print(f"Archived {model_name}: {new_value.get('id')}")
        # TODO: hide or retire the entry downstream

    elif operation == "delete":
        print(f"Deleted {model_name}: {previous_value.get('id')}")
        # TODO: delete the mirrored record (newValue is null)

    elif operation == "scheduledStart":
        print(f"Scheduled publish started for {model_name}: {new_value.get('id')}")
        # TODO: warm caches for content going live

    elif operation == "scheduledEnd":
        print(f"Scheduled publish ended for {model_name}: {new_value.get('id')}")
        # TODO: expire the content downstream

    else:
        print(f"Unhandled operation: {operation}")


@app.post("/webhooks/builder-io", dependencies=[Depends(require_builder_secret)])
async def builder_webhook(request: Request):
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
        print(f"Error handling Builder.io event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
