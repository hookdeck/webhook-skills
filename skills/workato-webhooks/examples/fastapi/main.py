# Generated with: workato-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The request method is chosen in the Workato recipe, so accept all of these.
METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_workato_request(headers, config=os.environ) -> bool:
    """Workato has no webhook signature. The recipe's HTTP action uses an HTTP
    connection with Basic auth, which sends:
      Authorization: Basic base64(username:password)
    This is a static shared credential: it authenticates the sender, not the
    body, and gives no replay protection.
    """
    user = config.get("WORKATO_WEBHOOK_USERNAME")
    password = config.get("WORKATO_WEBHOOK_PASSWORD")
    if not user or not password:
        return False  # never accept when unconfigured

    match = re.match(r"^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$", headers.get("authorization") or "", re.IGNORECASE)
    if not match:
        return False

    try:
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    if ":" not in decoded:
        return False

    # Split on the first colon (the password may itself contain ':') and
    # evaluate both comparisons before deciding (no short-circuit).
    req_user, req_password = decoded.split(":", 1)
    user_ok = safe_equal(req_user, user)
    password_ok = safe_equal(req_password, password)
    return user_ok and password_ok


async def require_workato_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_workato_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def handle_event(payload: dict) -> None:
    """Workato has no built-in webhook events: the payload is whatever the
    recipe's HTTP action sends. These examples assume {"event": "...", "data": {...}}."""
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "order.created":
        print(f"Order created: {data.get('order_id')}")
        # TODO: fulfil the order

    elif event == "record.updated":
        print(f"Record updated: {data.get('record_id')}")
        # TODO: sync the record

    elif event == "recipe.failed":
        print(f"Recipe failed: {data.get('recipe_name')} ({data.get('error')})")
        # TODO: alert the owning team

    else:
        print(f"Unhandled event: {event}")


@app.api_route("/webhooks/workato", methods=METHODS, dependencies=[Depends(require_workato_auth)])
async def workato_webhook(request: Request):
    raw_body = await request.body()

    # GET and DELETE usually have no body; that's fine.
    payload: dict = {}
    if raw_body.strip():
        try:
            parsed = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="Expected a JSON object")
        payload = parsed

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Workato request: {err}")
        # A non-2xx fails the recipe step (and retries, if the step has retries on).
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
