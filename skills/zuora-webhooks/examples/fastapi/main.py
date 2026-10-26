# Generated with: zuora-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The callout HTTP method is set on the template (POST by default).
ALLOWED_METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]

_BASE64 = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic_auth(header):
    """Parse "Authorization: Basic base64(username:password)".

    Scheme is case-insensitive; the credentials split on the FIRST colon, so the
    password may contain colons. Returns (username, password) as bytes, or None.
    """
    if not isinstance(header, str):
        return None
    parts = header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "basic" or not _BASE64.match(parts[1]):
        return None
    try:
        decoded = base64.b64decode(parts[1], validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")
    return (username, password) if sep else None


def verify_zuora_request(headers, username=None, password=None) -> bool:
    """Zuora callouts are not signed. The template's Username/Password authentication
    (with Enable Preemptive Authentication) sends HTTP Basic credentials on every request.
    Both values are compared before deciding, so a wrong username and a wrong password
    take the same time.
    """
    username = username if username is not None else os.environ.get("ZUORA_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("ZUORA_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False

    # Encode both sides to bytes: compare_digest raises on non-ASCII str.
    user_ok = safe_equal(creds[0], username.encode("utf-8"))
    pass_ok = safe_equal(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_zuora_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="zuora"'},
        )


def handle_callout(payload: dict) -> None:
    """Zuora adds no event field: the body is whatever merge fields the callout template
    defines. This handler assumes an illustrative JSON body such as
    {"event": "PaymentProcessed", "accountId": "..."} that you write into the template.
    """
    event = payload.get("event")

    if event == "PaymentProcessed":
        print(f"Payment processed for account {payload.get('accountId')}")
        # TODO: mark the invoice paid, then fetch full details from the Zuora API

    elif event == "InvoicePosted":
        print(f"Invoice posted for account {payload.get('accountId')}")
        # TODO: email the invoice, then fetch full details from the Zuora API

    else:
        print(f"Unhandled callout: {event}")


@app.api_route("/webhooks/zuora", methods=ALLOWED_METHODS, dependencies=[Depends(require_basic_auth)])
async def zuora_webhook(request: Request):
    # Read the raw body so any content type is accepted. GET carries no body.
    raw_body = await request.body()

    if not raw_body.strip():
        # Merge fields placed in the URL arrive as query parameters.
        payload = dict(request.query_params)
    else:
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_callout(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Zuora callout: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Zuora needs a 200; "success" satisfies the optional "Confirm success by parsing response content".
    return {"received": True, "success": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
