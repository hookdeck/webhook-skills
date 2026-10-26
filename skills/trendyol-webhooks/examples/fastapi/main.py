# Generated with: trendyol-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_trendyol_request(headers, secret=None) -> bool:
    """Trendyol does not sign payloads. With authenticationType API_KEY, every request
    carries the webhook's apiKey as plain text in the x-api-key header; compare the whole
    value. (Starlette headers are case-insensitive.)
    """
    secret = secret if secret is not None else os.environ.get("TRENDYOL_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("x-api-key")
    return bool(received) and safe_equal(received, secret)


async def require_trendyol_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_trendyol_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-api-key")


def handle_package(pkg: dict) -> None:
    """Each package is the full order package; its status says what changed."""
    status = str(pkg.get("status") or pkg.get("shipmentPackageStatus") or "").upper()
    ref = f"{pkg.get('orderNumber')} (package {pkg.get('shipmentPackageId')})"

    if status == "CREATED":
        print(f"Package created: {ref}")
        # TODO: import the order and start picking

    elif status == "PICKING":
        print(f"Package picking: {ref}")
        # TODO: mark the order as being prepared

    elif status == "INVOICED":
        print(f"Package invoiced: {ref}")
        # TODO: record the invoice (pkg["invoiceNumber"], pkg["invoiceLink"])

    elif status == "SHIPPED":
        print(f"Package shipped: {ref}")
        # TODO: store pkg["cargoTrackingNumber"] and pkg["cargoProviderName"]

    elif status == "DELIVERED":
        print(f"Package delivered: {ref}")
        # TODO: complete the order

    elif status == "UNDELIVERED":
        print(f"Package undelivered: {ref}")
        # TODO: follow up with the carrier

    elif status == "CANCELLED":
        print(f"Package cancelled: {ref}")
        # TODO: release stock (pkg["lines"][i]["cancelReason"])

    elif status == "RETURNED":
        print(f"Package returned: {ref}")
        # TODO: start the return flow

    elif status == "UNSUPPLIED":
        print(f"Package unsupplied: {ref}")
        # TODO: reconcile stock

    elif status == "AWAITING":
        print(f"Package awaiting: {ref}")

    elif status == "UNPACKED":
        print(f"Package unpacked: {ref}")

    elif status == "AT_COLLECTION_POINT":
        print(f"Package at collection point: {ref}")
        # TODO: notify the customer if you track pickup

    elif status == "VERIFIED":
        print(f"Package verified: {ref}")

    else:
        print(f"Unhandled package status: {status or '(none)'} for {ref}")


@app.post("/webhooks/trendyol", dependencies=[Depends(require_trendyol_key)])
async def trendyol_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict) or not isinstance(payload.get("content"), list):
        raise HTTPException(status_code=400, detail="Expected a JSON object with a content array")

    try:
        for pkg in payload["content"]:
            if isinstance(pkg, dict):
                handle_package(pkg)
    except Exception as err:  # noqa: BLE001
        # A non-2xx makes Trendyol re-send every 5 minutes, so handlers should be idempotent.
        print(f"Error handling Trendyol package: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
