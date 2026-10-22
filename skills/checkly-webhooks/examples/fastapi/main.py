import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_checkly_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Checkly signs the rendered body with HMAC-SHA256 and sends the hex digest."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.encode(), expected.encode())


@app.post("/webhooks/checkly")
async def checkly_webhook(
    request: Request,
    x_checkly_signature: str | None = Header(default=None),
):
    # Raw bytes: the body is a user-defined template and can be any content type
    raw_body = await request.body()

    if not x_checkly_signature:
        raise HTTPException(status_code=400, detail="Missing x-checkly-signature header")

    if not verify_checkly_signature(raw_body, x_checkly_signature, os.getenv("CHECKLY_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # alertType, checkName and checkId come from your Checkly body template
    alert_type = payload.get("alertType")
    name, check_id = payload.get("checkName"), payload.get("checkId")

    if alert_type == "ALERT_FAILURE":
        print(f"Check failed: {name} ({check_id})")
    elif alert_type == "ALERT_RECOVERY":
        print(f"Check recovered: {name} ({check_id})")
    elif alert_type == "ALERT_DEGRADED":
        print(f"Check degraded: {name} ({check_id})")
    else:
        print(f"Unhandled alert type: {alert_type}")

    return {"received": True}
