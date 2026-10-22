# Generated with: amplitude-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_amplitude_request(headers, secret=None, header_name=None) -> bool:
    """Amplitude does not sign webhook requests. You add a secret header in the
    destination's header rows; the name is your choice. Starlette headers are
    case-insensitive. The WHOLE value is compared: a "Bearer " prefix typed in
    Amplitude is part of the expected secret.
    """
    secret = secret if secret is not None else os.environ.get("AMPLITUDE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("AMPLITUDE_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_amplitude_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_amplitude_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_payload(payload: dict) -> None:
    # Default payloads: an event follows Amplitude's event format (has event_type);
    # a user update follows the user format (user_id and/or device_id, user_properties).
    # A FreeMarker template changes the shape, so branch on what your template emits.
    if isinstance(payload.get("event_type"), str):
        who = payload.get("user_id") or payload.get("device_id")
        print(f"Event {payload['event_type']} for user {who}")
        # TODO: use payload["event_properties"], payload["user_properties"], payload["event_time"]

    elif "user_id" in payload or "device_id" in payload:
        who = payload.get("user_id") or payload.get("device_id")
        print(f"User properties update for {who}")
        # TODO: sync payload["user_properties"]

    else:
        print("Unrecognised payload shape (custom FreeMarker template?)")


@app.post("/webhooks/amplitude", dependencies=[Depends(require_amplitude_secret)])
async def amplitude_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_payload(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Amplitude payload: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
