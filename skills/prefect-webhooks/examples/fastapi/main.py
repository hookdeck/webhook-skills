# Generated with: prefect-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison: encode both sides to bytes (str would raise on
    non-ASCII), then compare equal-length SHA-256 digests."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_prefect_request(headers, secret=None, header_name=None) -> bool:
    """Prefect does not sign Custom Webhook notifications. You add a secret header in the
    block's headers; the header name is yours, so it comes from PREFECT_WEBHOOK_HEADER
    (default "Authorization"). Compare the WHOLE value with PREFECT_WEBHOOK_SECRET:
    do not strip a "Bearer " prefix.
    """
    secret = secret if secret is not None else os.environ.get("PREFECT_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PREFECT_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_prefect_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_prefect_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_notification(payload: dict) -> None:
    """Prefect adds no event field: the body is whatever json_data / form_data template you
    configured on the block, with {{subject}}, {{body}} and {{name}} substituted. This
    example assumes an illustrative template:
      {"subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}"}
    """
    print(f'Prefect notification from "{payload.get("name")}": {payload.get("subject")}')
    print(payload.get("body"))
    # TODO: route by your own convention, e.g. match subject text or add a field to the template


def parse_body(raw_body: bytes, content_type: str) -> dict:
    """Parse only after the credential check. Empty bodies (e.g. GET) are valid."""
    text = raw_body.decode("utf-8")
    if not text.strip():
        return {}
    if "application/x-www-form-urlencoded" in content_type:
        return dict(parse_qsl(text))
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Expected a JSON object")
    return parsed


# The block's method is configurable (POST by default), so accept all of these.
@app.api_route(
    "/webhooks/prefect",
    methods=["POST", "PUT", "PATCH", "GET"],
    dependencies=[Depends(require_prefect_credential)],
)
async def prefect_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = parse_body(raw_body, request.headers.get("content-type", ""))
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid body")

    try:
        handle_notification(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Prefect notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
