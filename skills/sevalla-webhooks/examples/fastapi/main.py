# Generated with: sevalla-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# event_id is the same on every retry. Use a shared store (Redis, a database) in production.
seen_events: set = set()


def verify_sevalla_request(headers, secrets=None) -> bool:
    """Sevalla does not sign requests. The svl-signature header is NOT a signature: it carries
    the webhook's signing secret itself (whsec_ + 30 characters). Compare the whole value
    with the stored secret in constant time. The old secret is accepted too while a
    rollover is under way.
    """
    if secrets is None:
        secrets = [
            os.environ.get("SEVALLA_WEBHOOK_SECRET"),
            os.environ.get("SEVALLA_WEBHOOK_SECRET_OLD"),
        ]
    received = headers.get("svl-signature")
    if received is None:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return any(
        hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
        for secret in secrets
        if secret
    )


async def require_sevalla_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_sevalla_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing svl-signature")


def handle_event(payload: dict) -> None:
    event_type = payload.get("type")
    data = payload.get("data") or {}

    if event_type == "APP_CREATE":
        print(f"Application created: {data.get('display_name')} ({data.get('id')})")
        # TODO: register the application in your inventory

    elif event_type == "APP_DEPLOY":
        print(f"Application deployment {data.get('status')}: {data.get('app_display_name')} ({data.get('deployment_id')})")
        # TODO: notify chat on 'failed', run tests on 'success' (data["is_preview"] marks preview apps)

    elif event_type == "APP_UPDATE":
        print(f"Application updated: {data.get('display_name')} ({data.get('id')})")
        # TODO: refresh your inventory

    elif event_type == "APP_DELETE":
        print(f"Application deleted: {data.get('display_name')} ({data.get('id')})")
        # TODO: clean up

    elif event_type == "STATIC_SITE_CREATE":
        print(f"Static site created: {data.get('display_name')} ({data.get('id')})")
        # TODO: register the static site

    elif event_type == "STATIC_SITE_DEPLOY":
        print(f"Static site deployment {data.get('status')}: {data.get('static_site_display_name')} ({data.get('deployment_id')})")
        # TODO: purge caches or notify on 'success'

    elif event_type == "STATIC_SITE_UPDATE":
        print(f"Static site updated: {data.get('display_name')} ({data.get('id')})")
        # TODO: refresh your inventory

    elif event_type == "STATIC_SITE_DELETE":
        print(f"Static site deleted: {data.get('display_name')} ({data.get('id')})")
        # TODO: clean up

    elif event_type in ("DATABASE_CREATE", "DATABASE_UPDATE", "DATABASE_DELETE"):
        # Selectable in the dashboard but not sent by Sevalla at the moment.
        print(f"Database event: {event_type}")

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/sevalla", dependencies=[Depends(require_sevalla_secret)])
async def sevalla_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event_id = payload.get("event_id")
    if event_id and event_id in seen_events:
        return {"received": True, "duplicate": True}

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Sevalla event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_events.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
