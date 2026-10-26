# Generated with: omnisend-webhooks skill
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
    """Constant-time comparison. Both sides are encoded and hashed, so compare_digest
    never sees a str (which raises on non-ASCII) or unequal lengths."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_omnisend_request(headers, header_name=None, secret=None) -> bool:
    """Omnisend does not sign webhooks. Authenticate with a shared secret header you add to
    the automation's send webhook action. The header name is user-chosen
    (OMNISEND_WEBHOOK_HEADER, default X-Webhook-Secret); the whole header value must equal
    OMNISEND_WEBHOOK_SECRET (no Bearer parsing). This authenticates the sender, not the body,
    and gives no replay protection.
    """
    header_name = header_name or os.environ.get("OMNISEND_WEBHOOK_HEADER") or "X-Webhook-Secret"
    secret = secret if secret is not None else os.environ.get("OMNISEND_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    # Case-insensitive lookup that works for Starlette headers and plain dicts alike.
    wanted = header_name.lower()
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return bool(received) and safe_equal(received, secret)


async def require_omnisend_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_omnisend_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


# The body is the author's JSON template, so `event` is whatever the template sets.
def handle_event(payload: dict) -> None:
    event = payload.get("event")

    if event == "subscribed":
        print(f"Contact subscribed: {payload.get('contactEmail')}")
        # TODO: add the contact to your CRM or messaging tool

    elif event == "placed order":
        print(f"Order placed by: {payload.get('contactEmail')}")
        # TODO: sync the order (use [[event.raw.<property>]] tags for order data)

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/omnisend", dependencies=[Depends(require_omnisend_secret)])
async def omnisend_webhook(request: Request):
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
        print(f"Error handling Omnisend event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
