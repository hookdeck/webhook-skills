# Generated with: pax8-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes. Encode both sides: compare_digest raises
    TypeError when given a str containing non-ASCII characters."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_pax8_request(headers, config=os.environ) -> bool:
    """Pax8 does not sign payloads. It sends the `authorization` value you set on the
    webhook back in the `Authorization` header exactly as entered. Compare the WHOLE
    header value, including any "Bearer " or "Basic " prefix: don't strip, parse or
    base64-decode it. This authenticates the sender only; it gives no body integrity
    or replay protection.
    """
    expected = config.get("PAX8_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload: dict) -> dict:
    """The body is not documented (samplePayload is elided), so read topic and action
    defensively. Both are returned upper-case, or None when absent."""

    def norm(value):
        return value.upper() if isinstance(value, str) and value else None

    return {"topic": norm(payload.get("topic")), "action": norm(payload.get("action"))}


async def require_pax8_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_pax8_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    topic = classify(payload)["topic"]
    action = classify(payload)["action"]

    # SUBSCRIPTION and PRODUCT are the topic values the docs show; INVOICE, CLIENT, QUOTE
    # and USER are assumed from the docs' event category names. Check topic-definitions.
    if topic == "SUBSCRIPTION":
        print(f"Pax8 subscription {action}")
        # TODO: sync the subscription (the docs show the CREATE action) to your system

    elif topic == "INVOICE":
        print(f"Pax8 invoice {action}")
        # TODO: import the invoice into billing

    elif topic == "CLIENT":
        print(f"Pax8 client {action}")
        # TODO: update your customer record

    elif topic == "PRODUCT":
        print(f"Pax8 product {action}")
        # TODO: refresh your catalog cache

    elif topic == "QUOTE":
        print(f"Pax8 quote {action}")
        # TODO: sync the quote

    elif topic == "USER":
        print(f"Pax8 user {action}")
        # TODO: sync the user

    else:
        print("Unclassified Pax8 payload (no recognized topic)")


@app.post("/webhooks/pax8", dependencies=[Depends(require_pax8_auth)])
async def pax8_webhook(request: Request):
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
        print(f"Error handling Pax8 webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Pax8 marks a delivery failed after 10 seconds: acknowledge quickly.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
