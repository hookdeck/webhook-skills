# Generated with: formio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]

# With the default "Match" request method, Form.io mirrors the operation that triggered the
# action: POST = create, PUT = update, DELETE = delete. There is no event field.
OPERATIONS = {
    "POST": "create",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
    "GET": "read",
}

_BASIC = re.compile(r"^basic +([A-Za-z0-9+/]+={0,2}) *$", re.IGNORECASE)


def parse_basic_auth(header: Optional[str]) -> Optional[Tuple[bytes, bytes]]:
    """Parse 'Authorization: Basic base64(username:password)'.

    The scheme is case-insensitive and the credentials are split on the FIRST colon
    (passwords may contain colons). Returns (username, password) as bytes, or None.
    """
    match = _BASIC.match(header or "")
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1) + "=" * (-len(match.group(1)) % 4), validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")
    if not sep:
        return None
    return username, password


def verify_formio_request(headers, username=None, password=None) -> bool:
    """Form.io does not sign webhooks. The Webhook action's Authorize User / Authorize
    Password fields are sent as HTTP Basic auth. A static credential authenticates the
    sender only: it says nothing about the body and gives no replay protection.
    """
    username = username if username is not None else os.environ.get("FORMIO_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("FORMIO_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    # compare_digest on bytes (never str: it raises on non-ASCII). Evaluate both
    # comparisons before deciding (no short-circuit).
    user_ok = hmac.compare_digest(creds[0], username.encode("utf-8"))
    pass_ok = hmac.compare_digest(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_formio_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if request.method not in METHODS:
        raise HTTPException(status_code=405, detail="Method not allowed", headers={"Allow": ", ".join(METHODS)})
    if not verify_formio_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="formio-webhook"'},
        )


def handle_submission(operation: str, payload: dict, query) -> None:
    # payload: {request, response, submission, params}. DELETE and GET may have no body.
    submission = payload.get("submission") or {}

    if operation == "create":
        print(f"Submission created: {submission.get('_id')}")
        # TODO: create the matching record in your system (submission["data"])

    elif operation == "update":
        print(f"Submission updated: {submission.get('_id')}")
        # TODO: update the matching record

    elif operation == "delete":
        print(f"Submission deleted: {submission.get('_id') or query.get('submissionId') or '(see params)'}")
        # TODO: delete the matching record

    else:
        print(f"Unhandled {operation} request")


@app.api_route("/webhooks/formio", methods=METHODS, dependencies=[Depends(require_formio_basic_auth)])
async def formio_webhook(request: Request):
    # Read the raw body so any content type is accepted. GET and some DELETE are empty.
    raw_body = await request.body()

    payload: dict = {}
    if raw_body.strip():
        try:
            parsed = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="Expected a JSON object")
        payload = parsed

    operation = OPERATIONS[request.method]
    try:
        handle_submission(operation, payload, request.query_params)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Form.io webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "operation": operation}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
