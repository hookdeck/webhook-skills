# Generated with: soniox-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_soniox_request(headers, name=None, secret=None) -> bool:
    """Soniox does not sign payloads. It sends the header you set per transcription via
    webhook_auth_header_name / webhook_auth_header_value. Look the header up
    case-insensitively and compare the WHOLE value (no Bearer parsing). This authenticates
    the sender only: no signature, no timestamp, no replay protection.
    """
    name = name or os.environ.get("SONIOX_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("SONIOX_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = {k.lower(): v for k, v in headers.items()}.get(name.lower())
    if not received:
        return False
    # compare_digest on bytes: str would raise on non-ASCII; unequal lengths just return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_soniox_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_soniox_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook auth header")


def handle_transcription(payload: dict) -> None:
    transcription_id = payload.get("id")
    status = payload.get("status")

    if status == "completed":
        print(f"Transcription completed: {transcription_id}")
        # TODO: fetch the transcript from the Soniox API by id

    elif status == "error":
        print(f"Transcription failed: {transcription_id}")
        # TODO: look up the transcription by id, alert or retry

    else:
        print(f"Unhandled status: {status}")


@app.post("/webhooks/soniox", dependencies=[Depends(require_soniox_auth)])
async def soniox_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_transcription(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Soniox webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
