# Generated with: xendit-webhooks skill
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
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_xendit_token(headers, token=None) -> bool:
    """Xendit does not sign the payload (no HMAC). It sends your webhook
    verification token, unchanged, in the x-callback-token header. Compare it to
    the token from Dashboard > Settings > Webhooks.
    """
    token = token if token is not None else os.environ.get("XENDIT_CALLBACK_TOKEN")
    if not token:
        return False  # never accept when unconfigured
    received = headers.get("x-callback-token")
    if not received:
        return False
    return safe_equal(received, token)


async def require_xendit_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_xendit_token(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-callback-token")


def handle_event(payload: dict) -> None:
    """Payload shape varies by product:
    - Payments API webhooks have an "event" field and the resource under "data".
    - Invoice callbacks have no "event": the invoice is the body, with a "status"
      such as PAID or EXPIRED.
    """
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "payment.capture":
        print(f"Payment captured: {data.get('payment_id')} ({data.get('currency')} {data.get('request_amount')})")
        # TODO: fulfil the order, keyed on data["payment_id"] (webhooks can repeat)

    elif event == "payment.authorization":
        print(f"Payment authorized: {data.get('payment_id')}")
        # TODO: capture the payment or hold the order

    elif event == "payment.failure":
        print(f"Payment failed: {data.get('payment_id')} ({data.get('failure_code')})")
        # TODO: release stock, tell the customer

    elif event == "payment.expiry":
        print(f"Payment authorization expired: {data.get('payment_id')}")
        # TODO: release the reserved funds in your records

    elif event == "payment_request.expiry":
        print(f"Payment request expired: {data.get('payment_request_id') or data.get('id')}")
        # TODO: cancel the pending order

    elif event == "payment_token.activation":
        print(f"Payment token activated: {data.get('payment_token_id')}")
        # TODO: store the token for future charges

    elif event == "payment_token.failure":
        print(f"Payment token failed: {data.get('payment_token_id')}")
        # TODO: ask the customer to link a payment method again

    elif event == "payment_token.expiry":
        print(f"Payment token expired: {data.get('payment_token_id')}")
        # TODO: remove the stored token

    elif event == "refund.succeeded":
        print(f"Refund succeeded: {data.get('id')}")
        # TODO: mark the refund as completed

    elif event == "refund.failed":
        print(f"Refund failed: {data.get('id')}")
        # TODO: alert support

    elif not event and payload.get("status") == "PAID":
        # Invoice callback (no "event" field)
        print(f"Invoice paid: {payload.get('external_id') or payload.get('id')}")
        # TODO: mark the order as paid

    elif not event and payload.get("status") == "EXPIRED":
        print(f"Invoice expired: {payload.get('external_id') or payload.get('id')}")
        # TODO: cancel the order

    else:
        print(f"Unhandled Xendit webhook: {event or payload.get('status')}")


@app.post("/webhooks/xendit", dependencies=[Depends(require_xendit_token)])
async def xendit_webhook(request: Request):
    raw_body = await request.body()  # raw bytes, whatever the content type

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Xendit webhook: {err}")
        # A non-2xx makes Xendit retry (up to 6 times over 24 hours).
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
