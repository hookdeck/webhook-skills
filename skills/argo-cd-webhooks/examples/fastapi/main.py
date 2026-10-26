# Generated with: argo-cd-webhooks skill
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
    non-ASCII), here on equal-length SHA-256 digests."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_argo_cd_request(headers, secret=None, header_name=None) -> bool:
    """Argo CD does not sign webhooks. The notifications engine sends every header
    configured on the webhook service, so authenticate with a header you add
    (service.webhook.<name>.headers). The header name is yours to choose; the whole
    header value is compared exactly (a "Bearer " prefix is not parsed or stripped).
    """
    secret = secret if secret is not None else os.environ.get("ARGO_CD_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = header_name or os.environ.get("ARGO_CD_WEBHOOK_HEADER") or "Authorization"
    lowered = {k.lower(): v for k, v in headers.items()}  # header names are case-insensitive
    received = lowered.get(header_name.lower())
    return bool(received) and safe_equal(received, secret)


async def require_argo_cd_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read, for every method."""
    if not verify_argo_cd_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Argo CD webhook credential")


def handle_notification(payload: dict) -> None:
    # Illustrative payload: Argo CD has no event field. This body comes from the
    # template in references/setup.md, whose "trigger" field is written by that template.
    trigger = payload.get("trigger")
    app_name = payload.get("app")
    sync_status = payload.get("sync_status")
    health = payload.get("health")

    if trigger == "on-sync-succeeded":
        print(f"Sync succeeded: {app_name} (sync {sync_status}, health {health})")
        # TODO: mark the deployment as successful

    elif trigger == "on-sync-failed":
        print(f"Sync failed: {app_name} (sync {sync_status}, health {health})")
        # TODO: alert the team

    elif trigger == "on-health-degraded":
        print(f"Health degraded: {app_name} (sync {sync_status}, health {health})")
        # TODO: open an incident

    else:
        print(f"Unhandled notification: {trigger}")


# Argo CD sends GET unless the template sets a method, so accept every method the
# template can choose (GET, POST, PUT, PATCH) plus DELETE.
@app.api_route(
    "/webhooks/argo-cd",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_argo_cd_credential)],
)
async def argo_cd_webhook(request: Request):
    # Read the raw body so any content type is accepted. Argo CD sends the template body
    # with every method, GET (the default) included; it may also be empty.
    raw_body = await request.body()

    if not raw_body.strip():
        print(f"Argo CD {request.method} request with an empty body")
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_notification(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Argo CD notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
