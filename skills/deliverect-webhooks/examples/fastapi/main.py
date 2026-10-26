# Generated with: deliverect-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_HEADER = "x-server-authorization-hmac-sha256"
HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_deliverect_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str] = None) -> bool:
    """Deliverect sends a bare hex HMAC-SHA256 of the raw body in x-server-authorization-hmac-sha256.

    Nothing else is signed (no timestamp), and a GET with no body is signed over the empty
    string. The secret is used as UTF-8 bytes: the call's channelLink / locationId before
    certification, the Integration-settings HMAC secret after.
    """
    secret = secret if secret is not None else os.environ.get("DELIVERECT_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str):
        return False
    if not HEX_DIGEST.fullmatch(signature):  # validate before decoding
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: read the raw bytes (empty for a GET) and verify them first.

    Runs for every method, so no unverified request ever reaches the handler.
    """
    raw_body = await request.body()
    if not verify_deliverect_signature(raw_body, request.headers.get(SIGNATURE_HEADER)):
        raise HTTPException(status_code=401, detail="Invalid or missing Deliverect signature")
    return raw_body


# Deliverect has no event field: the kind of call is chosen by the URL you registered.
# Kind names and body fields below are illustrative; check your integration's payloads.
def handle_deliverect_call(kind: str, payload: dict) -> None:
    if kind == "order_status_update":
        order_id = payload.get("orderId")
        status = payload.get("status")
        order_id = order_id if isinstance(order_id, str) else "unknown"
        status = status if isinstance(status, (str, int)) and not isinstance(status, bool) else "unknown"
        print(f"Order {order_id} status: {status}")
        # TODO: update the order in your system

    elif kind == "menu_update":
        menus = payload.get("menus")
        menus = menus if isinstance(menus, list) else []
        print(f"Menu update with {len(menus)} menu(s)")
        # TODO: sync the menu

    elif kind == "snooze_unsnooze":
        operations = payload.get("operations")
        for op in operations if isinstance(operations, list) else []:
            if not isinstance(op, dict):
                continue
            action = op.get("action")
            action = action if isinstance(action, str) else "unknown"
            data = op.get("data")
            items = data.get("items") if isinstance(data, dict) else None
            items = items if isinstance(items, list) else []
            print(f'Snooze operation "{action}" for {len(items)} item(s)')
            # TODO: update item availability

    elif kind == "busy_mode":
        status = payload.get("status")
        print(f"Busy mode: {status if isinstance(status, str) else 'unknown'}")
        # TODO: pause or resume accepting orders

    else:
        print(f"Unhandled Deliverect call: {kind or '(no kind)'}")


# Deliverect sends mostly POSTs, but some signed calls are GETs with no body, so every method
# is accepted. The optional path segment picks the kind: /webhooks/deliverect/order_status_update.
@app.api_route("/webhooks/deliverect", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.api_route("/webhooks/deliverect/{kind}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def deliverect_webhook(kind: str = "", raw_body: bytes = Depends(verified_body)):
    # A verified call with no body (such as a GET) is simply acknowledged.
    if not raw_body.strip():
        print("Deliverect request with an empty body")
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_deliverect_call(kind.lower().replace("-", "_"), payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Deliverect webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
