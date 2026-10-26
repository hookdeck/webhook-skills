# Generated with: wiza-webhooks skill
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
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_wiza_request(headers, api_key=None) -> bool:
    """Wiza does not sign the body. Every webhook carries an x-auth-key header: the lowercase
    hex SHA-256 of your Wiza API key. It is the same on every request, so it proves who sent
    the request, not that the body is intact, and it gives no replay protection.
    """
    api_key = api_key if api_key is not None else os.environ.get("WIZA_API_KEY")
    if not api_key:
        return False  # never accept when unconfigured
    received = headers.get("x-auth-key")
    if not received:
        return False
    expected = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    return safe_equal(received, expected)


async def require_wiza_auth_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_wiza_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-auth-key")


def handle_event(payload: dict) -> None:
    data = payload.get("data")
    # The reveal's id; the envelope has no top-level id.
    event_id = data.get("id") if isinstance(data, dict) else None
    event_type = payload.get("type")
    status = payload.get("status")
    code = status.get("code") if isinstance(status, dict) else None

    if event_type == "individual_reveal":
        if code == 200:
            print(f"Reveal {event_id} finished")
            # TODO: store the contact details in payload["data"]
        elif code == 400:
            print(f"Reveal {event_id} failed")
            # TODO: flag the lookup as failed or retry it
        else:
            print(f"Reveal {event_id} has status {code}")

    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/wiza", dependencies=[Depends(require_wiza_auth_key)])
async def wiza_webhook(request: Request):
    # Read the raw body so any content type is accepted.
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
        print(f"Error handling Wiza event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
