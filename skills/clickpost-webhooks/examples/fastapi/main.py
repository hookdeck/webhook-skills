# Generated with: clickpost-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SCHEME = "token "


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time compare on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def verify_clickpost_request(headers, configured=None) -> bool:
    """ClickPost does not sign payloads. With Simple Token authentication it sends
    `Authorization: Token <secret>`. The scheme is "Token" (not "Bearer") and is
    matched case-insensitively. The secret is stored bare; if the configured value
    itself starts with "Token ", strip it. The secret is never trimmed or altered.
    """
    configured = configured if configured is not None else os.environ.get("CLICKPOST_WEBHOOK_SECRET")
    if not configured:
        return False  # never accept when unconfigured
    secret = configured[len(SCHEME):] if configured.lower().startswith(SCHEME) else configured
    header = headers.get("authorization")
    if not header or header[: len(SCHEME)].lower() != SCHEME:
        return False
    return safe_equal(header[len(SCHEME):].encode("utf-8"), secret.encode("utf-8"))


async def require_clickpost_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_clickpost_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization: Token header")


# Scans can be redelivered or arrive out of order: dedupe on waybill + scan.
# In-memory for the demo; use a database or cache with a TTL in production.
seen: set = set()


def handle_scan(payload: dict) -> None:
    code = payload.get("clickpost_status_code")
    desc = payload.get("clickpost_status_description")
    waybill = payload.get("waybill")

    if code == 1:
        print(f"Order placed: {waybill}")
    elif code == 2:
        print(f"Pickup pending: {waybill}")
    elif code == 4:
        print(f"Picked up: {waybill}")
    elif code == 5:
        print(f"In transit: {waybill} at {payload.get('location')}")
    elif code == 6:
        print(f"Out for delivery: {waybill}")
        # TODO: notify the customer
    elif code == 8:
        print(f"Delivered: {waybill}")
        # TODO: mark the order delivered
    elif code == 9:
        print(f"Failed delivery: {waybill} ({payload.get('status')})")
        # TODO: start the NDR / reattempt flow
    elif code in (41, 42, 43, 44):
        print(f"Rider update {code} ({desc}): {waybill}")
    elif code in (47, 48, 50, 52):
        print(f"Partial delivery / RTO update {code} ({desc}): {waybill}")
    else:
        print(f"Unhandled clickpost_status_code {code} ({desc}): {waybill}")


@app.post("/webhooks/clickpost", dependencies=[Depends(require_clickpost_token)])
async def clickpost_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    code = payload.get("clickpost_status_code") if isinstance(payload, dict) else None
    if isinstance(code, bool) or not isinstance(code, int):
        raise HTTPException(status_code=400, detail="Expected a ClickPost scan object")

    key = f"{payload.get('waybill')}:{code}:{payload.get('timestamp')}"
    if key in seen:
        return {"received": True, "duplicate": True}

    try:
        handle_scan(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling ClickPost scan: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")
    seen.add(key)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
