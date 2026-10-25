# Generated with: ukg-ready-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest raises
    TypeError on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_ukg_ready_request(headers, config=os.environ) -> bool:
    """UKG Ready (Ready only, not UKG Pro) does not sign payloads. With Bearer Token
    authentication it is expected to send `Authorization: Bearer <token>`. Compare the WHOLE header
    value, including the "Bearer " prefix: do not strip, parse or base64-decode it.
    """
    expected = config.get("UKG_READY_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_ukg_ready_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_ukg_ready_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_payload(payload: dict) -> None:
    # The payload shape is chosen per subscription and shown only in the UKG Ready app, and
    # it carries no documented event-type field (ACCOUNT_CREATED / ACCOUNT_UPDATED are
    # subscription categories). Treat it as the latest values of the selected fields.
    print(f"UKG Ready webhook with fields: {', '.join(payload)}")
    # TODO: sync the changed employee/account fields to your system (idempotently)


@app.post("/webhooks/ukg-ready", dependencies=[Depends(require_ukg_ready_auth)])
async def ukg_ready_webhook(request: Request):
    # Read the raw body so any content type works.
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
        print(f"Error handling UKG Ready webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
