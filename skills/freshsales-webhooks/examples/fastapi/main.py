# Generated with: freshsales-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The workflow's request type is user-chosen, so accept all of these.
METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison of bytes (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_freshsales_request(headers, secret=None, header_name=None) -> bool:
    """Freshsales does not sign webhooks. Authenticate with a secret custom header you
    add on the workflow's Trigger webhook action. The header name is yours to choose
    (FRESHSALES_WEBHOOK_HEADER); the WHOLE header value must equal
    FRESHSALES_WEBHOOK_SECRET. No "Bearer " parsing: a prefix is part of the value.
    """
    secret = secret if secret is not None else os.environ.get("FRESHSALES_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("FRESHSALES_WEBHOOK_HEADER") or "X-Webhook-Secret"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name.lower())  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_freshsales_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_freshsales_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_payload(method: str, payload) -> str:
    """Freshsales sends no event type: the body is whatever the workflow author chose
    (Simple fields or Advanced content with placeholders). This example assumes an
    illustrative Advanced body with a top-level "deal" or "contact" object.
    """
    if isinstance(payload, dict) and payload.get("deal"):
        deal = payload["deal"]
        print(f"Deal webhook ({method}): {deal.get('id')} {deal.get('name', '')}")
        # TODO: sync the deal (deal["amount"], deal["stage"])
        return "deal"

    if isinstance(payload, dict) and payload.get("contact"):
        contact = payload["contact"]
        print(f"Contact webhook ({method}): {contact.get('id')} {contact.get('email', '')}")
        # TODO: sync the contact (contact["first_name"], contact["email"])
        return "contact"

    print(f"Freshsales webhook ({method}) with no deal or contact object")
    return "unknown"


@app.api_route("/webhooks/freshsales", methods=METHODS, dependencies=[Depends(require_freshsales_secret)])
async def freshsales_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET and DELETE give b"".
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body (set Encoding to JSON)")

    try:
        handle_payload(request.method, payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Freshsales webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
