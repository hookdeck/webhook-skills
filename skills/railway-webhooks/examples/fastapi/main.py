# Generated with: railway-webhooks skill
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
    """Constant-time comparison. Both sides are encoded to bytes (compare_digest raises on
    non-ASCII str) and hashed so the digests have equal length."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_railway_request(headers, secret=None, header_name=None) -> bool:
    """Railway does not sign payloads. You add a custom header (name and value) to the
    webhook in Project Settings > Webhooks; Railway sends it with every delivery.
    The header name comes from RAILWAY_WEBHOOK_HEADER (default Authorization) and the WHOLE
    expected value (including any "Bearer " prefix) from RAILWAY_WEBHOOK_SECRET.
    Starlette headers are case-insensitive.
    """
    secret = secret if secret is not None else os.environ.get("RAILWAY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("RAILWAY_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_railway_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_railway_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("type")
    details = payload.get("details") or {}
    service = ((payload.get("resource") or {}).get("service") or {}).get("name")
    suffix = f" for {service}" if service else ""

    if event_type == "Deployment.failed":
        print(f"Deployment failed{suffix}: {details.get('id')}")
        # TODO: alert the team (details["commitMessage"], payload["resource"])

    # Other deployment states (Deployment.<state>) and alert types are not enumerated in
    # Railway's docs, so match on the prefix and log anything else.
    elif isinstance(event_type, str) and event_type.startswith("Deployment."):
        print(f"Deployment {event_type[len('Deployment.'):]}{suffix}")
        # TODO: update your deploy dashboard

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/railway", dependencies=[Depends(require_railway_secret)])
async def railway_webhook(request: Request):
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
        print(f"Error handling Railway event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
