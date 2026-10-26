# Generated with: bringg-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_bringg_request(headers, config=os.environ) -> bool:
    """Bringg does not sign webhooks. Authenticate with the Static Header you added to the
    webhook: the header name is yours (BRINGG_WEBHOOK_HEADER, default Authorization) and the
    expected value (BRINGG_WEBHOOK_SECRET) is compared whole, including any "Bearer " prefix.
    Starlette headers are case-insensitive.
    """
    secret = config.get("BRINGG_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured

    received = headers.get(config.get("BRINGG_WEBHOOK_HEADER") or "Authorization")
    if not received:
        return False

    # Bytes on both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_bringg_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read or parsed."""
    if not verify_bringg_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def handle_event(payload: dict) -> None:
    """Every Bringg webhook body carries a webhook_type. Order (task) webhooks include the
    order object; the exact fields depend on the webhook and any Flexible Webhook setup."""
    event = payload.get("webhook_type")

    if event == "task_created":
        print(f"Order created: {payload.get('id')} ({payload.get('title')})")
        # TODO: create the order in your OMS

    elif event == "task_done":
        print(f"Order done: {payload.get('id')}")
        # TODO: mark the order as delivered

    elif event == "task_cancelled":
        print(f"Order cancelled: {payload.get('id')}")
        # TODO: cancel the order downstream

    elif event == "driver_assigned":
        print(f"Order assigned to driver: {payload.get('id')}")
        # TODO: notify the customer

    elif event == "way_point_arrived":
        print("Driver arrived at destination")
        # TODO: send an "arrived" notification

    elif event == "note_created":
        print("Order attachment created")
        # TODO: store the note, photo or signature

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/bringg", dependencies=[Depends(require_bringg_auth)])
async def bringg_webhook(request: Request):
    # Any content type is accepted: read the raw bytes and parse them ourselves.
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
        print(f"Error handling Bringg event: {err}")
        # Bringg tries each webhook three times; unconfirmed ones land in its undelivered report.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
