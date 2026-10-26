# Generated with: rebilly-webhooks skill
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

# Strict base64 alphabet: anything after the credentials (spaces, "!", extra "=") fails the match.
BASIC_RE = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)


def parse_basic_auth(header):
    """Parse "Authorization: Basic base64(username:password)" into (username, password) bytes.

    Returns None when the header is missing or malformed.
    """
    if not header:
        return None
    match = BASIC_RE.fullmatch(header)
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")  # split on the FIRST colon
    if not sep:
        return None
    return username, password


def verify_rebilly_request(headers, username=None, password=None) -> bool:
    """Rebilly sends HTTP basic auth with every webhook when the webhook has credentials.

    There is no signature check here: a static credential authenticates the sender, not the
    body, and gives no replay protection.
    """
    username = username if username is not None else os.environ.get("REBILLY_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("REBILLY_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    # compare_digest on bytes (never str, which raises on non-ASCII). Evaluate both comparisons
    # before deciding (no short-circuit).
    user_ok = hmac.compare_digest(creds[0], username.encode("utf-8"))
    pass_ok = hmac.compare_digest(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read.

    Hookdeck never sends a 401 challenge, so the credentials must arrive with every request.
    """
    if not verify_rebilly_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing basic auth credentials")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")

    if event_type == "transaction-processed":
        print(f"Transaction processed")
        # TODO: fulfil the order, inspect payload["_embedded"]["transaction"]

    elif event_type == "transaction-declined":
        print(f"Transaction declined")
        # TODO: notify the customer or retry with another payment instrument

    elif event_type == "customer-created":
        print(f"Customer created")
        # TODO: create the matching account in your system

    elif event_type == "subscription-activated":
        print(f"Subscription activated")
        # TODO: grant access

    elif event_type == "subscription-canceled":
        print(f"Subscription canceled")
        # TODO: schedule access removal

    elif event_type == "invoice-issued":
        print(f"Invoice issued")
        # TODO: email or store the invoice

    elif event_type == "invoice-paid":
        print(f"Invoice paid")
        # TODO: mark the order as paid

    elif event_type == "data-export-completed":
        print(f"Data export completed: {payload.get('dataExportId')}")
        # TODO: download the file from the "download" link in payload["_links"]

    else:
        print(f"Unhandled event: {event_type}")


# Rebilly sends GET, POST, PUT, PATCH or DELETE, as configured on the webhook, so accept them all.
@app.api_route(
    "/webhooks/rebilly",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_basic_auth)],
)
async def rebilly_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    if not raw_body.strip():
        # GET and DELETE webhooks (or an empty body template) carry no payload.
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
        print(f"Error handling Rebilly event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Rebilly retries unless the response is exactly HTTP 200, within 20 seconds.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
