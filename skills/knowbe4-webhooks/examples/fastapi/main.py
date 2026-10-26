# Generated with: knowbe4-webhooks skill
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
    """Constant-time string comparison (compare_digest on equal-length digests, as bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_knowbe4_request(headers, config=os.environ) -> bool:
    """KnowBe4 does not sign webhooks. You add a custom header (Key and Value) to the KSAT
    or PhishER webhook; its name is yours to choose. Look it up case-insensitively (Starlette
    headers do this) and compare the WHOLE value (do not strip a "Bearer " prefix). A static
    secret authenticates the sender, not the body, and gives no replay protection.
    """
    expected = config.get("KNOWBE4_WEBHOOK_SECRET")
    if not expected:
        return False  # never accept when unconfigured
    name = (config.get("KNOWBE4_WEBHOOK_HEADER") or "Authorization").lower()
    received = headers.get(name)  # request.headers is case-insensitive; lowercase also suits a plain dict
    if not received:
        return False
    return safe_equal(received, expected)


async def require_knowbe4_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_knowbe4_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def handle_event(payload: dict) -> None:
    """The body is defined by your own webhook configuration and KnowBe4 documents no event
    field. ILLUSTRATIVE: this example reads an `event_type` string, e.g. the UI label
    "Phish Failure Removed". Inspect a real delivery and adapt.
    """
    event_type = payload.get("event_type")
    if not isinstance(event_type, str):
        event_type = None

    if event_type == "Phish Failure Removed":
        print("KSAT: phish failure removed")
        # TODO: update the user's risk record in your system

    else:
        print(f"KnowBe4 payload received{f' ({event_type})' if event_type else ''}")
        # TODO: route PhishER message data or other KSAT events here


@app.post("/webhooks/knowbe4", dependencies=[Depends(require_knowbe4_auth)])
async def knowbe4_webhook(request: Request):
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
        print(f"Error handling KnowBe4 webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
