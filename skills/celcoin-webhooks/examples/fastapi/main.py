# Generated with: celcoin-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hmac
import json
import os
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Celcoin Webhook Handler")

# Celcoin's docs don't name the HTTP method, so accept all the usual ones.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

_BASIC_RE = re.compile(r"^basic[ \t]+(\S+)$", re.IGNORECASE)


def verify_celcoin_auth(
    authorization: Optional[str],
    username: Optional[str] = None,
    password: Optional[str] = None,
) -> bool:
    """
    Authenticate a Celcoin webhook request.

    Celcoin does NOT sign webhook payloads. When the subscription is registered with
    auth.type "basic", every notification carries
    `Authorization: Basic base64(login:pwd)`.
    """
    if not username or not password:
        return False  # never accept when unconfigured
    if not authorization:
        return False

    match = _BASIC_RE.match(authorization.strip())
    if not match:
        return False

    try:
        # validate=True: base64 alphabet only, so valid credentials followed by junk fail
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except ValueError:  # binascii.Error, UnicodeDecodeError, non-ASCII input
        return False

    if ":" not in decoded:
        return False
    # Split on the FIRST colon; the password may contain ':'
    user, _, pw = decoded.partition(":")

    # compare_digest on bytes (str raises on non-ASCII); evaluate both, no short-circuit
    user_ok = hmac.compare_digest(user.encode("utf-8"), username.encode("utf-8"))
    pass_ok = hmac.compare_digest(pw.encode("utf-8"), password.encode("utf-8"))
    return user_ok and pass_ok


def require_celcoin_auth(authorization: Optional[str] = Header(None)) -> None:
    """FastAPI dependency: runs before the body is read, for every method."""
    username = os.getenv("CELCOIN_WEBHOOK_USERNAME")
    password = os.getenv("CELCOIN_WEBHOOK_PASSWORD")

    # Fail closed: without configured credentials there is nothing to check.
    if not username or not password:
        print("Set CELCOIN_WEBHOOK_USERNAME and CELCOIN_WEBHOOK_PASSWORD")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    # Hookdeck never sends a 401 challenge, so the header must be present on each request.
    if not verify_celcoin_auth(authorization, username, password):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def handle_celcoin_event(payload: Dict[str, Any]) -> None:
    # Envelope: {entity, createTimestamp, status: CONFIRMED | ERROR, body, error?}
    entity = payload.get("entity")
    status = payload.get("status")
    body = payload.get("body") or {}
    event_id = body.get("id") if isinstance(body, dict) else None

    if entity == "pix-payment-out":
        print(f"Pix payment out {status}", event_id)
        # TODO: mark the Pix transfer as settled (CONFIRMED) or failed (ERROR)
    elif entity == "pix-payment-in":
        print(f"Pix payment in {status}", event_id)
        # TODO: credit the customer for the received Pix
    elif entity == "pix-reversal-out":
        print(f"Pix reversal out {status}", event_id)
        # TODO: record the refund you issued
    elif entity == "pix-reversal-in":
        print(f"Pix reversal in {status}", event_id)
        # TODO: reconcile the refund received for a Pix-out
    elif entity == "internal-transfer-in":
        print(f"Internal transfer in {status}", event_id)
        # TODO: credit the receiving account
    elif entity == "internal-transfer-out":
        print(f"Internal transfer out {status}", event_id)
        # TODO: confirm the debit
    elif entity == "spb-transfer-out":
        print(f"TED out {status}", event_id)
        # TODO: confirm the TED (on ERROR see payload["error"])
    elif entity == "spb-transfer-in":
        print(f"TED in {status}", event_id)
        # TODO: credit the received TED
    elif entity == "onboarding-create":
        print(f"Onboarding account created {status}")
        # TODO: store the new account details
    elif entity == "onboarding-proposal":
        print(f"Onboarding proposal result {status}")
        # TODO: continue or stop the onboarding journey (proposal Approved or Reproved)
    elif entity == "kyc":
        print(f"KYC result {status}")
        # TODO: update the account's compliance state
    else:
        print(f"Unhandled Celcoin entity: {entity}")


@app.api_route(
    "/webhooks/celcoin",
    methods=ALLOWED_METHODS,
    dependencies=[Depends(require_celcoin_auth)],
)
async def handle_celcoin_webhook(request: Request):
    # Read the body raw (any content type); the credential was already checked.
    raw = await request.body()

    # GET and DELETE (and some PUT/PATCH) carry no body: acknowledge them.
    if not raw.strip():
        return {"received": True}

    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_celcoin_event(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Celcoin event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
