# Generated with: mono-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# event_id is reused across Mono's retries. Use a shared store (Redis, a DB unique key) in production.
seen_event_ids: set = set()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of the encoded bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_mono_request(headers, secret=None) -> bool:
    """Mono does not sign payloads. Every webhook carries a mono-webhook-secret header
    holding the app's webhook secret as plain text; compare the whole value.
    A static shared credential authenticates the sender, not the body, and gives no
    replay protection, so use HTTPS and rotate the secret if it leaks.
    """
    secret = secret if secret is not None else os.environ.get("MONO_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("mono-webhook-secret")
    return bool(received) and safe_equal(received, secret)


async def require_mono_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_mono_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing mono-webhook-secret")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    data = payload.get("data") or {}
    obj = data.get("object") or {}

    if event == "mono.events.account_connected":
        print(f"Account connected: {data.get('id')}")
        # TODO: store data["id"] for the customer (data["meta"]["ref"]) and start retrieving data

    elif event == "mono.events.account_updated":
        print(f"Account updated: {(data.get('account') or {}).get('_id')}")
        # TODO: sync data["account"] and check data["meta"]["data_status"]

    elif event == "mono.events.account_unlinked":
        print("Account unlinked")
        # TODO: remove the stored account

    elif event == "direct_debit.payment_successful":
        print(f"Payment successful: {obj.get('reference')}")
        # TODO: fulfil the order for data["object"]["reference"]

    elif event == "direct_debit.payment_failed":
        print(f"Payment failed: {obj.get('reference')}")
        # TODO: notify the customer and offer a retry

    elif event == "direct_debit.payment_cancelled":
        print(f"Payment cancelled: {obj.get('reference')}")
        # TODO: release held stock

    elif event == "direct_debit.payment_abandoned":
        print(f"Payment abandoned: {obj.get('reference')}")
        # TODO: expire the pending payment

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/mono", dependencies=[Depends(require_mono_secret)])
async def mono_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event_id = payload.get("event_id")
    if event_id and event_id in seen_event_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Mono event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_event_ids.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
