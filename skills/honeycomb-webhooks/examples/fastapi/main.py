# Generated with: honeycomb-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Honeycomb's docs don't name the HTTP method, so accept all the usual ones.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Delivery IDs already handled. In-memory for the example: use a shared store (Redis, DB) in production.
seen_deliveries: set = set()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_honeycomb_request(headers, secret=None) -> bool:
    """Honeycomb does not sign payloads. It sends the webhook's Shared Secret as plain text
    in the X-Honeycomb-Webhook-Token header. This authenticates the sender only: it does not
    cover the body and gives no replay protection. Compare the WHOLE header value.
    """
    secret = secret if secret is not None else os.environ.get("HONEYCOMB_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("x-honeycomb-webhook-token")  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_honeycomb_secret(request: Request) -> None:
    """FastAPI dependency: reject the request, for every method, before the body is read."""
    if not verify_honeycomb_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Honeycomb-Webhook-Token")


def classify_alert(payload: dict) -> str:
    """Honeycomb doesn't document the default payload field by field, and a webhook can use a
    custom JSON template per alert type, so classify by the fields present. Illustrative only.
    """
    keys = list(payload.keys())
    if any(re.search(r"^slo|burn|budget|exhaustion", k, re.I) for k in keys):
        return "slo_burn_alert"
    if any(re.search(r"anomal", k, re.I) for k in keys):
        return "anomaly"
    if any(re.search(r"^trigger|^threshold|^result", k, re.I) for k in keys):
        return "trigger"
    return "unknown"


def handle_alert(payload: dict) -> None:
    kind = classify_alert(payload)

    if kind == "trigger":
        print(f"Trigger alert: {payload.get('name') or payload.get('trigger_id') or '(unnamed)'}")
        # TODO: page on-call or open an incident

    elif kind == "slo_burn_alert":
        print(f"SLO burn alert: {payload.get('slo_name') or payload.get('name') or '(unnamed)'}")
        # TODO: escalate before the error budget runs out

    elif kind == "anomaly":
        print("Anomaly detection alert")
        # TODO: open an investigation

    else:
        print(f"Unrecognised Honeycomb payload (keys: {', '.join(payload.keys())})")


@app.api_route("/webhooks/honeycomb", methods=METHODS, dependencies=[Depends(require_honeycomb_secret)])
async def honeycomb_webhook(request: Request):
    # The delivery ID is stable across retries of the same delivery.
    delivery_id = request.headers.get("x-honeycomb-webhook-delivery-id")
    if delivery_id and delivery_id in seen_deliveries:
        return {"received": True, "duplicate": True}

    # Read the raw body so any content type is accepted; an empty body is fine.
    raw_body = await request.body()
    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        if payload is not None:
            handle_alert(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Honeycomb alert: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if delivery_id:
        seen_deliveries.add(delivery_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
