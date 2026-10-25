# Generated with: redo-webhooks skill
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
    """Constant-time comparison (compare_digest on bytes: SHA-256 digests of both sides)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_redo_request(headers, config=os.environ) -> bool:
    """Redo does not sign payloads. The only authentication is the static
    `Authorization: Bearer <subscriber-secret>` header. Compare the complete header
    value, including the "Bearer " prefix (do not strip or parse it).
    A static credential authenticates the sender, not the body, and gives no replay
    protection: use HTTPS and rotate the secret if it leaks.
    """
    expected = config.get("REDO_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload: dict):
    """Subscribe with the topics return.created and return.updated; the payload `type`
    is the short form (created, updated), plus `backfill` for historical events."""
    return {
        "created": "return.created",
        "updated": "return.updated",
        "backfill": "backfill",
    }.get(payload.get("type"))


async def require_redo_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_redo_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event = classify(payload)
    ret = payload.get("return") or {}

    if event == "return.created":
        print(f"Return {ret.get('id')} created ({ret.get('status')})")
        # TODO: open a ticket or notify the warehouse

    elif event == "return.updated":
        print(f"Return {ret.get('id')} updated ({ret.get('status')})")
        # TODO: sync the return status; dedupe on return.id + payload["at"]

    elif event == "backfill":
        print(f"Backfill event for return {ret.get('id')}")
        # TODO: load history without triggering customer-facing side effects

    else:
        print(f"Unhandled Redo event type: {payload.get('type')}")


@app.post("/webhooks/redo", dependencies=[Depends(require_redo_auth)])
async def redo_webhook(request: Request):
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
        print(f"Error handling Redo webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
