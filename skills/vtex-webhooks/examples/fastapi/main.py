# Generated with: vtex-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_vtex_request(headers, name=None, secret=None) -> bool:
    """VTEX does not sign hooks. It sends the entries of the hook configuration's
    "headers" object with every notification, so we check a secret header we added.
    The header name is user-chosen; the whole value is compared (no Bearer parsing).
    """
    name = name or os.environ.get("VTEX_WEBHOOK_HEADER") or "X-Webhook-Secret"
    secret = secret if secret is not None else os.environ.get("VTEX_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    # Case-insensitive lookup (works for Starlette headers and plain dicts alike).
    received = {k.lower(): v for k, v in headers.items()}.get(name.lower())
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


def parse_json(raw: bytes):
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def handle_event(payload: dict) -> None:
    order_id = payload.get("OrderId")
    state = payload.get("State")

    if state == "order-created":
        print(f"Order created: {order_id}")
        # TODO: create the order in your ERP

    elif state == "on-order-completed":
        print(f"Order completed: {order_id}")
        # TODO: confirm the order downstream

    elif state == "payment-pending":
        print(f"Payment pending: {order_id}")
        # TODO: hold fulfillment

    elif state == "payment-approved":
        print(f"Payment approved: {order_id}")
        # TODO: release the order for fulfillment

    elif state == "waiting-ffmt-authorization":
        print(f"Waiting for fulfillment authorization: {order_id}")
        # TODO: approve or reject fulfillment

    elif state == "ready-for-handling":
        print(f"Ready for handling: {order_id}")
        # TODO: create a pick/pack task

    elif state == "start-handling":
        print(f"Start handling: {order_id}")
        # TODO: reserve stock

    elif state == "handling":
        print(f"Handling: {order_id}")
        # TODO: update tracking status

    elif state == "invoiced":
        print(f"Invoiced: {order_id}")
        # TODO: send the invoice, trigger shipping

    elif state == "cancel":
        print(f"Cancel: {order_id}")
        # TODO: stop fulfillment

    elif state == "canceled":
        print(f"Canceled: {order_id}")
        # TODO: restock and refund

    else:
        print(f"Unhandled state: {state}")


@app.post("/webhooks/vtex")
async def vtex_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()
    payload = parse_json(raw_body)

    # Setup ping: answer 200 before the auth check (the docs don't say if it carries headers).
    if isinstance(payload, dict) and payload.get("hookConfig") == "ping":
        return {"received": True}

    if not verify_vtex_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling VTEX event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
