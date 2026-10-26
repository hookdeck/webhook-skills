# Generated with: auvik-webhooks skill
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
    """Constant-time comparison on bytes (compare_digest on equal-length digests).

    Both sides are encoded to bytes: compare_digest raises TypeError for non-ASCII str.
    """
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_auvik_request(headers, header_name=None, secret=None) -> bool:
    """Auvik does not sign payloads. With Header authentication it sends the custom
    header (Key and Value) you configured. Starlette headers are case-insensitive.
    The WHOLE value is compared: no "Bearer " parsing. This authenticates the sender
    only; it gives no body integrity or replay protection.
    """
    header_name = header_name or os.environ.get("AUVIK_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("AUVIK_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_auvik_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_auvik_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Auvik webhook header")


def handle_alert(payload: dict) -> None:
    status = payload.get("alertStatusString")
    name = payload.get("alertName")
    entity = payload.get("entityName")
    company = payload.get("companyName")

    if status == "Triggered":
        print(f"Alert triggered: {name} on {entity} ({company})")
        # TODO: open an incident or ticket (payload["alertId"], payload["alertDescription"], payload["link"])

    elif status == "Cleared":
        print(f"Alert cleared: {name} on {entity} ({company})")
        # TODO: resolve the matching incident (payload["alertId"])

    else:
        print(f"Unhandled alert status: {status}")


@app.post("/webhooks/auvik", dependencies=[Depends(require_auvik_header)])
async def auvik_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_alert(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Auvik alert: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
