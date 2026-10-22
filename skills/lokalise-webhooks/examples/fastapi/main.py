# Generated with: lokalise-webhooks skill
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
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_lokalise_request(headers, config=os.environ) -> bool:
    """Lokalise does not sign webhook payloads. It sends the webhook secret you
    configured as-is in a request header: X-Secret by default, or X-Api-Key / a
    custom header if you chose one in the Webhooks app. Set LOKALISE_WEBHOOK_HEADER
    to match.
    """
    secret = config.get("LOKALISE_WEBHOOK_SECRET")
    header_name = config.get("LOKALISE_WEBHOOK_HEADER") or "X-Secret"
    if not secret:
        return False  # never accept when unconfigured

    received = headers.get(header_name.lower())  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_lokalise_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_lokalise_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret")


def handle_event(payload: dict) -> None:
    """Event names are the `event` field of the JSON body (also sent in the X-Event header).
    See https://developers.lokalise.com/docs/webhook-events"""
    event = payload.get("event")
    project = payload.get("project") or {}
    user = payload.get("user") or {}

    if event == "project.translation.updated":
        language = payload.get("language") or {}
        key = payload.get("key") or {}
        translation = payload.get("translation") or {}
        print(
            f"Translation updated in {project.get('name')} ({language.get('iso')}): "
            f"{key.get('name')} = \"{translation.get('value')}\""
        )
        # TODO: sync the changed string to your app or CDN

    elif event == "project.translations.updated":
        print(f"{len(payload.get('translations') or [])} translations updated via {payload.get('action')}")
        # TODO: sync the bulk change (up to 300 translations per event)

    elif event == "project.key.added":
        print(f"Key added: {(payload.get('key') or {}).get('name')} by {user.get('email')}")

    elif event == "project.keys.added":
        print(f"{len(payload.get('keys') or [])} keys added via {payload.get('action')}")
        # TODO: register the new keys (up to 300 per event)

    elif event in ("project.key.modified", "project.keys.modified"):
        print(f"Keys modified in {project.get('name')}")
        # TODO: refresh the affected keys

    elif event == "project.keys.deleted":
        print(f"{len(payload.get('keys') or [])} keys deleted in {project.get('name')}")
        # TODO: remove the keys from your app

    elif event == "project.task.closed":
        task = payload.get("task") or {}
        print(f"Task closed: {task.get('title')} ({task.get('id')})")
        # TODO: pull the finished translations

    elif event == "project.imported":
        print(f"Files imported into {project.get('name')}")

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/lokalise", dependencies=[Depends(require_lokalise_secret)])
async def lokalise_webhook(request: Request):
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None  # Lokalise sends a ping when a webhook is created; it only needs a 2xx.

    if not isinstance(payload, dict) or not isinstance(payload.get("event"), str):
        return {"received": True, "ignored": True}

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Lokalise event: {err}")
        # Non-2xx (or no reply within 8 seconds) makes Lokalise retry for up to 24 hours.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
