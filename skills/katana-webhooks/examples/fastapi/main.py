# Generated with: katana-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Katana's docs don't name the HTTP method, so accept all five.
METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_katana_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Verify Katana's x-sha2-signature: lowercase hex HMAC-SHA256 of the raw body bytes,
    keyed with the webhook's token as UTF-8 (never hex-decoded). Nothing else is signed.
    """
    secret = secret if secret is not None else os.environ.get("KATANA_WEBHOOK_SECRET")
    if not secret or not signature or not HEX_DIGEST.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest on bytes: it raises TypeError for non-ASCII str
    return hmac.compare_digest(expected.encode("ascii"), signature.lower().encode("ascii"))


# Dispatch on the top-level `action` field. `object` only holds id, status and href.
def handle_event(payload: dict) -> None:
    action = payload.get("action")
    obj = payload.get("object") or {}

    if action == "sales_order.created":
        print(f"Sales order created: {obj.get('id')}")
        # TODO: fetch the order from obj['href'] and sync it

    elif action == "sales_order.delivered":
        print(f"Sales order delivered: {obj.get('id')}")
        # TODO: send a shipping confirmation

    elif action == "purchase_order.received":
        print(f"Purchase order received: {obj.get('id')}")
        # TODO: update inbound stock

    elif action == "manufacturing_order.done":
        print(f"Manufacturing order done: {obj.get('id')}")
        # TODO: update finished-goods inventory

    elif action == "inventory.product_out_of_stock":
        print(f"Product out of stock: {obj.get('id')}")
        # TODO: trigger a reorder

    else:
        print(f"Unhandled event: {action}")


@app.api_route("/webhooks/katana", methods=METHODS)
async def katana_webhook(request: Request):
    # Raw bytes, exactly as received. A request with no body (e.g. GET) is verified over zero bytes.
    raw_body = await request.body()

    if not verify_katana_signature(raw_body, request.headers.get("x-sha2-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    # A verified request with no body (e.g. a GET) carries no event: acknowledge it.
    if not raw_body:
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Katana webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
