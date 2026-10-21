# Generated with: dealhub-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""DealHub webhook receiver.

DEALHUB WEBHOOK AUTHENTICATION

DealHub does NOT sign webhooks: no signature header, no HMAC, no timestamp.
Each webhook uses one of three Authentication Types:

  Token : DealHub sends  Authorization: Bearer <TOKEN>
  Basic : DealHub sends  Authorization: Basic <CREDENTIALS>
  None  : no header (only for endpoints with no auth, or a SAS token in the URL)

CAVEAT: the credential is the FULL Authorization header value, scheme included.
Build the exact expected string and compare the whole header in constant time.
"""

import base64
import hmac
import json
import os
from typing import Any, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="DealHub Webhook Receiver")


def expected_authorization(env: Mapping[str, str] = os.environ) -> Optional[str]:
    """Build the Authorization value DealHub should send; None when unconfigured."""
    token = env.get("DEALHUB_WEBHOOK_TOKEN")
    if token:
        return f"Bearer {token}"
    username = env.get("DEALHUB_WEBHOOK_USERNAME")
    password = env.get("DEALHUB_WEBHOOK_PASSWORD")
    if username and password:
        credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        return f"Basic {credentials}"
    return None


def verify_dealhub_authorization(header: Optional[str], expected: Optional[str]) -> bool:
    """Constant-time compare of the full Authorization header value."""
    if not header or not expected:
        return False
    return hmac.compare_digest(header.encode("utf-8"), expected.encode("utf-8"))


def event_name(payload: Any) -> str:
    """The DealHub event name lives in the payload's `event` field."""
    if isinstance(payload, dict):
        if isinstance(payload.get("event"), str):
            return payload["event"]
        # "Failure WebHook v1" is documented with only error_code / error_description.
        if "error_code" in payload or "error_description" in payload:
            return "Failure WebHook v1"
    return "unknown"


async def require_dealhub_auth(request: Request) -> None:
    """FastAPI dependency: authenticate the DealHub Authorization header."""
    expected = expected_authorization()
    if not expected:
        # Fail closed on misconfiguration: 500, distinguishable from a bad credential.
        print(
            "Set DEALHUB_WEBHOOK_TOKEN (Token mode) or DEALHUB_WEBHOOK_USERNAME and "
            "DEALHUB_WEBHOOK_PASSWORD (Basic mode) - refusing unauthenticated webhooks"
        )
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    authorization = request.headers.get("authorization")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not verify_dealhub_authorization(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/dealhub", dependencies=[Depends(require_dealhub_auth)])
async def dealhub_webhook(request: Request):
    # Authenticated by the dependency; parse only now.
    try:
        payload = json.loads(await request.body())
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # event_info.event_id identifies this event notification: use it as your idempotency key.
    event_info = payload.get("event_info") if isinstance(payload, dict) else None
    event_id = event_info.get("event_id") if isinstance(event_info, dict) else None
    print(f"Authenticated DealHub webhook: {event_name(payload)} ({event_id or 'no event_id'})")

    handle_event(payload)
    return {"received": True}


def handle_event(payload: Any) -> None:
    # TODO: check payload["event_info"]["event_id"] against your store and return if seen.
    name = event_name(payload)

    # --- Quote entity events -------------------------------------------------
    if name == "draftQuote":
        state = "created" if payload.get("newly_created_quote") else "updated"
        print(f"Draft quote {payload.get('dealhub_quote_id')} ({state})")
    elif name == "primaryQuote":
        # Only the NEW primary quote is sent; infer that the previous one lost the flag.
        print(
            f"Primary quote {payload.get('dealhub_quote_id')} "
            f"for opportunity {payload.get('dealhub_opportunity_id')}"
        )
    elif name == "quotePendingApproval":
        print(f"Quote pending approval: {payload.get('dealhub_quote_id')}")
    elif name == "quoteReady":
        print(f"Quote ready to send: {payload.get('dealhub_quote_id')}")
    elif name == "quoteRejected":
        print(f"Quote rejected: {payload.get('dealhub_quote_id')}")
    elif name == "quoteRecalled":
        print(f"Quote recalled: {payload.get('dealhub_quote_id')}")
    elif name == "quotePublished":
        print(f"Quote published to DealRoom: {payload.get('dealhub_quote_id')}")
    elif name == "quoteUnpublished":
        print(f"Quote unpublished: {payload.get('dealhub_quote_id')}")
    elif name == "quoteWon":
        print(f"Quote won: {payload.get('dealhub_quote_id')}")

    # --- Version / user events (dispatch on `action`) ------------------------
    elif name == "version":
        # action: created | activated | reactivated
        print(f"Version {payload.get('version_id')} {payload.get('action')} (status {payload.get('status')})")
    elif name == "user":
        # action: created | modified | deleted
        print(f"User {payload.get('user_login')} {payload.get('action')}")

    # --- System & async events -----------------------------------------------
    elif name == "productsUpload":
        # upload_status: success | error; event_info.request_id identifies the upload
        print(
            f"Products upload {payload.get('upload_status')} for version "
            f"{payload.get('version_id')} ({payload.get('imported_skus')} SKUs)"
        )
    elif name == "crmImport":
        print("CRM import completed")
    elif name == "Failure WebHook v1":
        print(f"Async request failed: {payload.get('error_code')} {payload.get('error_description')}")

    # --- DealRoom events -----------------------------------------------------
    elif name == "DEALROOM_EVENT":
        # The specific activity is the key of action_summary, e.g. DEAL_SIGN.
        activity = next(iter(payload.get("action_summary") or {}), None)
        print(f"DealRoom activity {activity} on quote {payload.get('dealhub_quote_id')}")

    else:
        print(f"Unhandled DealHub event: {name}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
