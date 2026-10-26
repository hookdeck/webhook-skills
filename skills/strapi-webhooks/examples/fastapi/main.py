# Generated with: strapi-webhooks skill
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
    non-ASCII), here via equal-length SHA-256 digests so the secret's length isn't leaked."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_strapi_request(headers, secret=None, header_name=None) -> bool:
    """Strapi does not sign webhooks. Authenticate the request with a header you add in
    Strapi (per webhook in the admin panel, or webhooks.defaultHeaders in config/server).
    The header name is yours to choose; the expected value is compared in full, so a
    "Bearer " prefix typed in Strapi must be part of STRAPI_WEBHOOK_SECRET. Nothing is
    stripped or parsed.
    """
    secret = secret if secret is not None else os.environ.get("STRAPI_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = header_name or os.environ.get("STRAPI_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name.lower())  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_strapi_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_strapi_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict, headers) -> None:
    # The body's `event` matches the X-Strapi-Event header.
    event = payload.get("event") or headers.get("x-strapi-event")
    model = payload.get("model")
    entry = payload.get("entry") or {}
    media = payload.get("media") or {}

    if event == "entry.create":
        print(f"Entry created: {model} {entry.get('documentId')}")
        # TODO: index the new entry (payload["entry"])

    elif event == "entry.update":
        print(f"Entry updated: {model} {entry.get('documentId')}")
        # TODO: refresh caches or search index

    elif event == "entry.delete":
        print(f"Entry deleted: {model} {entry.get('documentId')}")
        # TODO: remove the entry downstream (payload only carries the entry's own fields)

    elif event == "entry.publish":
        print(f"Entry published: {model} {entry.get('documentId')}")
        # TODO: trigger a site rebuild or revalidate the page

    elif event == "entry.unpublish":
        print(f"Entry unpublished: {model} {entry.get('documentId')}")
        # TODO: take the page down

    elif event == "entry.draft-discard":
        print(f"Draft discarded: {model} {entry.get('documentId')}")
        # TODO: refresh previews

    elif event == "media.create":
        print(f"Media created: {media.get('name')}")
        # TODO: sync the file (payload["media"]["url"], payload["media"]["formats"])

    elif event == "media.update":
        print(f"Media updated: {media.get('name')}")
        # TODO: refresh the cached file

    elif event == "media.delete":
        print(f"Media deleted: {media.get('name')}")
        # TODO: purge the file from your CDN

    elif event == "review-workflows.updateEntryStage":
        # Enterprise only. This envelope carries `entity` and `workflow`, not `entry`.
        stages = (payload.get("workflow") or {}).get("stages") or {}
        print(
            f"Review stage changed: {(stages.get('from') or {}).get('name')} -> "
            f"{(stages.get('to') or {}).get('name')}"
        )
        # TODO: notify reviewers

    elif event == "releases.publish":
        # Growth and Enterprise. This envelope carries `release`, not `entry`.
        print(f"Release published: {(payload.get('release') or {}).get('name')}")
        # TODO: trigger a deployment

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/strapi", dependencies=[Depends(require_strapi_credential)])
async def strapi_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload, request.headers)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Strapi event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
