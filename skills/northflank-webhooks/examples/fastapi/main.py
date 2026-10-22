# Generated with: northflank-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

TOKEN_HEADER = "X-Northflank-Notification-Integration-Token"


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_northflank_request(headers, config=os.environ) -> bool:
    """Northflank does not sign the payload. The secret you set on the
    notification integration is sent as-is in the
    X-Northflank-Notification-Integration-Token header; compare it with
    NORTHFLANK_WEBHOOK_SECRET.
    """
    secret = config.get("NORTHFLANK_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured

    token = headers.get(TOKEN_HEADER)
    if not token:
        return False
    return safe_equal(token, secret)


async def require_northflank_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_northflank_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing token")


def handle_event(payload: dict) -> None:
    """Event names come from Northflank's notification integration trigger list.
    Only the build payload is shown in the docs; read other payloads defensively."""
    event = payload.get("event")
    data = payload.get("data") or {}
    build = data.get("build") or {}
    service = data.get("service") or {}
    project = (data.get("project") or {}).get("id")

    if event == "build:start":
        print(f"Build started: {build.get('id')} ({project}/{service.get('id')})")

    elif event == "build:success":
        print(f"Build succeeded: {build.get('id')} ({project}/{service.get('id')})")
        # TODO: trigger a release or notify your team

    elif event == "build:failure":
        print(f"Build failed: {build.get('id')} ({project}/{service.get('id')})")
        # TODO: open a ticket or alert the owning team

    elif event == "service:deployment:status-update":
        print(f"Deployment status update in {project}")
        # TODO: update your deployment dashboard

    elif event == "job-run:failure":
        print(f"Job run failed in {project}")
        # TODO: create a ticket in your bug tracker

    elif event == "addon-backup:success":
        print(f"Backup succeeded in {project}")
        # TODO: download the backup via the Northflank API

    elif event == "addon-backup:failure":
        print(f"Backup failed in {project}")
        # TODO: alert the owning team

    elif event == "billing:invoice-payment-failed":
        print("Invoice payment failed")
        # TODO: notify your finance contact

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/northflank", dependencies=[Depends(require_northflank_token)])
async def northflank_webhook(request: Request):
    # Raw bytes, whatever the content type.
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
        print(f"Error handling Northflank event: {err}")
        # Northflank resends notifications that don't get a 2xx.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
