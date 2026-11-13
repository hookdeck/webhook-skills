# Generated with: firstbase-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_firstbase_request(headers, header_name=None, secret=None) -> bool:
    """Firstbase does not sign payloads. With Custom header authentication it sends the
    header name and value you entered. Compare the WHOLE value (no Bearer parsing).
    Starlette headers are case-insensitive. compare_digest gets bytes, never str, so
    non-ASCII input can't raise.
    """
    header_name = header_name or os.environ.get("FIRSTBASE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("FIRSTBASE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    if not received:
        return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_firstbase_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_firstbase_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")

    if event_type == "CREATED":
        print(f"Firstbase {payload.get('resourceType')} created: {payload.get('resourceId')}")
        # Fetch the new order, return or inventory order from the Firstbase API by resourceId

    elif event_type == "UPDATED":
        print(f"Firstbase {payload.get('resourceType')} updated: {payload.get('resourceId')}")
        # Re-fetch the resource and read its status: the granular event isn't in the payload

    elif event_type == "DELETED":
        print(f"Firstbase {payload.get('resourceType')} deleted: {payload.get('resourceId')}")
        # Remove or archive your local copy of the resource

    else:
        print(f"Unhandled eventType: {event_type}")


@app.post("/webhooks/firstbase", dependencies=[Depends(require_firstbase_credential)])
async def firstbase_webhook(request: Request):
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
        print(f"Error handling Firstbase event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
