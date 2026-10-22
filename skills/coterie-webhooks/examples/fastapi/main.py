# Generated with: coterie-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_coterie_request(headers, config=os.environ) -> bool:
    """Coterie does not sign payloads. The only authentication is an opt-in static
    header named `Authentication` (not `Authorization`) whose whole value is
    `token <guid>`. Compare the complete header value, including the "token " prefix.
    """
    expected = config.get("COTERIE_AUTHENTICATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authentication")
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload: dict):
    """Coterie webhooks have no event-type field. The three kinds are told apart
    by their identifier key."""
    keys = {k.lower() for k in payload}
    if "quoteid" in keys:
        return "quote"
    if "policyid" in keys:
        return "policy"
    if "applicationid" in keys:
        return "application"
    return None


async def require_coterie_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_coterie_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authentication header")


def handle_event(payload: dict) -> None:
    kind = classify(payload)

    if kind == "application":
        print(f"Application {payload.get('applicationId')}: {payload.get('Status')}")
        # TODO: sync the application status (e.g. ReadyToQuote) to your system

    elif kind == "quote":
        print(f"Quote {payload.get('quoteId')} ({payload.get('PolicyType')}): premium {payload.get('Premium')}")
        # TODO: show the quote to the customer

    elif kind == "policy":
        print(f"Policy {payload.get('PolicyNumber')}: {payload.get('Status')}")
        # TODO: record the policy status (e.g. Pending)

    else:
        print("Unhandled Coterie payload (no applicationId, quoteId or PolicyId)")


@app.post("/webhooks/coterie", dependencies=[Depends(require_coterie_auth)])
async def coterie_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Coterie webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
