# Generated with: timify-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_timify_request(headers, secret=None, header_name=None) -> bool:
    """TIMIFY does not sign payloads. When "Include header name" is enabled on the webhook
    subscription, every request carries the header name and secret value you chose.
    Compare the WHOLE header value (no Bearer parsing). Starlette headers are
    case-insensitive. compare_digest gets bytes, so non-ASCII values can't raise.
    """
    secret = secret if secret is not None else os.environ.get("TIMIFY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TIMIFY_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and hmac.compare_digest(
        received.encode("utf-8"), secret.encode("utf-8")
    )


async def require_timify_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_timify_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing TIMIFY webhook header")


def handle_event(payload: dict) -> None:
    """TIMIFY's webhook overview names each webhook (Customers, Event, Resource, ...) and its
    type (Created, Updated, Deleted), but documents no payload fields, so this handler doesn't
    guess which field carries them. Give each webhook scope its own subscription and Server URL,
    as TIMIFY suggests, or capture one delivery and branch on the field it actually uses.
    """
    print(f"TIMIFY webhook received with fields: {', '.join(payload.keys())}")
    # Process the delivery here


@app.post("/webhooks/timify", dependencies=[Depends(require_timify_header)])
async def timify_webhook(request: Request):
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
        print(f"Error handling TIMIFY event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
