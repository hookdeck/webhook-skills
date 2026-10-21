# Generated with: azure-logic-apps-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Receiver for outbound calls from an Azure Logic Apps (or Power Automate) HTTP action.

Logic Apps does NOT sign requests. Authenticate the call with a credential the
workflow sends:

    Basic authentication : Authorization: Basic base64(username:password)
    Raw authentication   : Authorization: <whatever you typed in "Value">
    Custom header        : any header you add under the action's "Headers"

Basic uses AZURE_LOGIC_APPS_USERNAME / _PASSWORD. A shared secret uses
AZURE_LOGIC_APPS_SHARED_SECRET in the AZURE_LOGIC_APPS_SECRET_HEADER header
(set it to "Authorization" for Raw auth). Every configured method must pass;
with nothing configured the endpoint fails closed.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("azure-logic-apps-webhooks")

app = FastAPI(title="Azure Logic Apps webhook receiver")

DEFAULT_SECRET_HEADER = "x-logic-apps-secret"
_BASIC_RE = re.compile(r"^Basic\s+([A-Za-z0-9+/=]+)\s*$", re.IGNORECASE)


@dataclass
class Config:
    username: str
    password: str
    shared_secret: str
    secret_header: str


def get_config() -> Config:
    return Config(
        username=os.environ.get("AZURE_LOGIC_APPS_USERNAME", ""),
        password=os.environ.get("AZURE_LOGIC_APPS_PASSWORD", ""),
        shared_secret=os.environ.get("AZURE_LOGIC_APPS_SHARED_SECRET", ""),
        secret_header=(
            os.environ.get("AZURE_LOGIC_APPS_SECRET_HEADER") or DEFAULT_SECRET_HEADER
        ).lower(),
    )


def safe_equal(received: str, expected: str) -> bool:
    """Constant-time compare. Hashing first hides the expected value's length."""
    a = hashlib.sha256(received.encode("utf-8")).digest()
    b = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(a, b)


def verify_basic_auth(authorization: Optional[str], username: str, password: str) -> bool:
    """Verify `Authorization: Basic base64(username:password)`."""
    if not authorization:
        return False
    match = _BASIC_RE.match(authorization)
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    # The username can't contain ':', the password can.
    user, sep, pwd = decoded.partition(":")
    if not sep:
        return False
    # Evaluate both compares so a wrong username takes as long as a wrong password.
    user_ok = safe_equal(user, username)
    pass_ok = safe_equal(pwd, password)
    return user_ok and pass_ok


def verify_shared_secret(header_value: Optional[str], secret: str) -> bool:
    """Verify a shared secret sent in a header (custom, or Authorization for Raw auth)."""
    if not header_value or not secret:
        return False
    return safe_equal(header_value, secret)


def authenticate_logic_app(request: Request, config: Config = Depends(get_config)) -> None:
    """FastAPI dependency: rejects the request unless every configured method passes."""
    basic_configured = bool(config.username and config.password)
    secret_configured = bool(config.shared_secret)

    if not basic_configured and not secret_configured:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No Azure Logic Apps credentials configured",
        )
    if basic_configured and not verify_basic_auth(
        request.headers.get("authorization"), config.username, config.password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Basic authentication",
            headers={"WWW-Authenticate": 'Basic realm="azure-logic-apps"'},
        )
    if secret_configured and not verify_shared_secret(
        request.headers.get(config.secret_header), config.shared_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid shared secret"
        )


@app.post("/webhooks/azure-logic-apps", dependencies=[Depends(authenticate_logic_app)])
async def azure_logic_apps_webhook(request: Request) -> dict:
    # Logic Apps sends whatever the action's Body is: JSON by default, but it can be
    # text, form-urlencoded or multipart. Read the raw bytes and parse after auth.
    raw_body = await request.body()
    content_type = request.headers.get("content-type", "")

    payload: object = raw_body.decode("utf-8", errors="replace")
    if "json" in content_type and raw_body:
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")

    # No event type or delivery id comes from Logic Apps. If you need either, have the
    # workflow put them in the Body or Headers (e.g. "@{workflow()['run']['name']}").
    logger.info("Received Azure Logic Apps workflow call: %s %r", content_type, payload)

    # Return 200, not 202: a 202 makes a stateful workflow's HTTP action follow the
    # async polling pattern and poll the Location header.
    return {"received": True}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
