# Generated with: sap-successfactors-webhooks skill
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

_BASIC_RE = re.compile(r"^basic +([^ ]+)$", re.IGNORECASE)
_B64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")


def parse_basic_auth(header: Optional[str]) -> Optional[Tuple[bytes, bytes]]:
    """Parse `Authorization: Basic base64(username:password)`.

    The scheme is case-insensitive, the token must use only the strict base64
    alphabet and decode strictly (validate=True), so valid credentials followed
    by junk are rejected. The pair is split on the FIRST colon. Returns bytes.
    """
    if not isinstance(header, str):
        return None
    match = _BASIC_RE.match(header)
    if not match:
        return None
    token = match.group(1)
    if len(token) % 4 != 0 or not _B64_RE.match(token):
        return None
    try:
        decoded = base64.b64decode(token, validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")
    if not sep:
        return None
    return username, password


def verify_sap_successfactors_request(headers, username=None, password=None) -> bool:
    """SAP SuccessFactors does not sign requests. The Integration Center REST connection
    sends HTTP Basic credentials; this checks them against your configured pair.
    Both comparisons run before the result is decided (no short-circuit).
    """
    username = username if username is not None else os.environ.get("SAP_SUCCESSFACTORS_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    # compare_digest on bytes: str would raise TypeError on non-ASCII input.
    user_ok = hmac.compare_digest(
        hashlib.sha256(creds[0]).digest(), hashlib.sha256(username.encode("utf-8")).digest()
    )
    pass_ok = hmac.compare_digest(
        hashlib.sha256(creds[1]).digest(), hashlib.sha256(password.encode("utf-8")).digest()
    )
    return user_ok and pass_ok


async def require_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_sap_successfactors_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def parse_body(raw: bytes, content_type: str) -> Tuple[str, object]:
    """The body is whatever the integration author mapped from the starting entity, in
    the chosen payload format (JSON or XML). There is no vendor event field.
    Parse JSON only when the content type says so; otherwise keep the raw text.
    """
    if not raw:
        return "empty", None
    if re.search(r"(^|/|\+)json\b", content_type, re.IGNORECASE):
        return "json", json.loads(raw)
    text = raw.decode("utf-8", errors="replace")
    if re.search(r"xml", content_type, re.IGNORECASE):
        return "xml", text
    return "text", text


def handle_delivery(method: str, fmt: str, data: object) -> None:
    # Illustrative only: your mapped fields decide what arrives. Example JSON body:
    #   {"userId":"example-1001","firstName":"Ada","lastName":"Lovelace","department":"Engineering"}
    print(f"SAP SuccessFactors {method} delivery ({fmt})")
    # TODO: process the mapped record(s). GET deliveries and empty requests carry no body.


# The sender picks GET or POST on the REST operation. POST is recommended.
@app.api_route(
    "/webhooks/sap-successfactors",
    methods=["GET", "POST"],
    dependencies=[Depends(require_basic_auth)],
)
async def sap_successfactors_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        fmt, data = parse_body(raw_body, request.headers.get("content-type", ""))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        handle_delivery(request.method, fmt, data)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling SAP SuccessFactors delivery: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "format": fmt}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
