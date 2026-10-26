# Generated with: navattic-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Navattic's docs don't name the HTTP method, so accept all of these.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_navattic_request(headers, config=os.environ) -> bool:
    """Navattic does not sign payloads. The only authentication is an Authorization
    header ("Basic <credentials>" or "Bearer <token>"), sent only when configured on the
    webhook. Compare the complete header value, including the scheme prefix. Don't parse
    or decode it. A static credential authenticates the sender, not the body, and gives
    no replay protection.
    """
    expected = config.get("NAVATTIC_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def classify_data(data):
    """Visitor events carry {session, endUser, companyAccount}. Account events carry
    the company account object itself as `data`."""
    if not isinstance(data, dict):
        return None
    if data.get("session"):
        return "visitor"
    if data.get("id") or data.get("websiteDomain"):
        return "account"
    return None


async def require_navattic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_navattic_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")

    if event_type == "session_closed":
        data = payload.get("data")
        kind = classify_data(data)
        if kind == "visitor":
            end_user = data.get("endUser") or {}
            account = data.get("companyAccount") or {}
            print(
                f"Visitor session closed at {payload.get('timestamp')}: "
                f"{data['session'].get('mostRecentDemoName')} "
                f"({end_user.get('mostRecentEmail', 'unknown visitor')}, {account.get('name', 'no account')})"
            )
            # TODO: push the session to your CRM, notify sales
        elif kind == "account":
            print(f"Account session closed at {payload.get('timestamp')}: {data.get('name') or data.get('id')}")
            # TODO: update the account in your system
        else:
            print("session_closed with unrecognised data shape")

    else:
        print(f"Unhandled Navattic event: {event_type}")


@app.api_route("/webhooks/navattic", methods=METHODS, dependencies=[Depends(require_navattic_auth)])
async def navattic_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    if not raw_body.strip():
        # Authenticated request with no body: nothing to process.
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
        print(f"Error handling Navattic webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
