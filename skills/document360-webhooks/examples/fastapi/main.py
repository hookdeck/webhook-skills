# Generated with: document360-webhooks skill
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
    """Constant-time comparison: compare_digest on bytes (equal-length SHA-256 digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_document360_request(headers, secret=None, header_name=None) -> bool:
    """Document360 does not sign payloads. You add a key-value header to the Webhook
    channel; its name is your choice (DOCUMENT360_WEBHOOK_HEADER, default "Authorization")
    and the expected value is the WHOLE header value (DOCUMENT360_WEBHOOK_SECRET),
    including any "Bearer " prefix you typed. Starlette headers are case-insensitive.
    """
    secret = secret if secret is not None else os.environ.get("DOCUMENT360_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = header_name or os.environ.get("DOCUMENT360_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_document360_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_document360_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    # Payload keys are display labels with spaces, e.g. "Knowledge base name".
    event = payload.get("Event")
    article = payload.get("Article name")

    if event == "Article published":
        print(f"Article published: {article}")
        # TODO: notify the docs team or refresh a search index

    elif event == "Article created":
        print(f"Article created: {article}")
        # TODO: add the article to a content tracker

    elif event == "Article deleted":
        print(f"Article deleted: {article}")
        # TODO: purge cache entries for every language in payload["Slugs"]

    elif event == "Article settings saved":
        print(f"Article settings saved: {article}")
        # TODO: re-sync article metadata

    elif event == "Article workflow status updated":
        print(f"Article workflow status updated: {article}")
        # TODO: trigger the downstream review step

    elif event == "Extension token deleted":
        print(f"Extension token deleted: {payload.get('Extension')}")
        # TODO: alert the integration owner

    else:
        print(f"Unhandled event: {event}")


# Document360 lets the user pick POST or PUT, so the route accepts both.
@app.api_route(
    "/webhooks/document360",
    methods=["POST", "PUT"],
    dependencies=[Depends(require_document360_credential)],
)
async def document360_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    if not raw_body.strip():
        # Empty body: nothing to dispatch, but the sender is authenticated.
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
        print(f"Error handling Document360 event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
