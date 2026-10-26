# Generated with: arcadia-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_arcadia_request(headers, env=None) -> bool:
    """Arcadia does not sign payloads. Arcadia support adds a custom header (name and
    value) to every webhook. The name is user-chosen, so it comes from
    ARCADIA_WEBHOOK_HEADER; the whole header value is compared with
    ARCADIA_WEBHOOK_SECRET (no "Bearer " parsing). This authenticates the sender,
    not the body, and gives no replay protection.
    """
    env = os.environ if env is None else env
    secret = env.get("ARCADIA_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    name = env.get("ARCADIA_WEBHOOK_HEADER") or "X-Arcadia-Token"
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_arcadia_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_arcadia_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Arcadia webhook header")


# In-memory de-duplication on the payload id. Use a durable store in production.
seen: set = set()


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")
    resource = payload.get("resource")
    data = payload.get("data") or {}

    if event_type == "STATUS_CHANGE":
        print(f"Status change on {resource}: {data.get('id')}")
        # TODO: if data["isCustomerActionRequired"], prompt the user to fix the connection

    elif event_type == "NEW_DATA_AVAILABLE":
        print(f"New data available for {resource}: {data.get('id')}")
        # TODO: fetch the new data for data["accounts"]

    elif event_type == "EXISTING_DATA_UPDATED":
        print(f"Existing data updated for {resource}: {data.get('id')}")
        # TODO: re-sync the affected records

    elif event_type == "DATA_DELETED":
        print(f"Data deleted ({resource}): {data.get('businessUnitId')}")
        # TODO: remove or move local copies (data["movedToBusinessUnitId"])

    elif event_type == "BUSINESS_UNIT_ASSIGNMENT":
        print(f"Business unit assignment ({resource})")
        # TODO: update ownership of data["account"]

    elif event_type == "REAL_TIME_CREDENTIAL_VALIDATION_SUCCESS":
        print(f"Credential validated: {data.get('id')}")
        # TODO: mark the connection ready

    elif event_type == "REAL_TIME_CREDENTIAL_VALIDATION_FAILURE":
        print(f"Credential validation failed: {data.get('id')}")
        # TODO: ask the user to re-enter their utility credentials

    elif event_type == "MFA_CHALLENGE_METHOD":
        print(f"MFA method needed for credential {(data.get('credential') or {}).get('id')}")
        # TODO: show data["verificationMethods"] and submit the choice

    elif event_type == "MFA_CHALLENGE_CODE":
        print(f"MFA code needed for credential {(data.get('credential') or {}).get('id')}")
        # TODO: prompt the user for the code

    else:
        print(f"Unhandled eventType: {event_type}")


@app.post("/webhooks/arcadia", dependencies=[Depends(require_arcadia_header)])
async def arcadia_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event_id = payload.get("id")
    if event_id and event_id in seen:
        return {"received": True, "duplicate": True}

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Arcadia event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
