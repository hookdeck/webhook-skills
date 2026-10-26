import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

TIMESTAMP_RE = re.compile(r"^[1-9][0-9]*$")


def verify_bindbee_signature(
    raw_body: bytes,
    webhook_id: str | None,
    timestamp: str | None,
    signature_header: str | None,
    secret: str | None,
    tolerance_seconds: int = 0,
) -> bool:
    """Verify a Bindbee (Standard Webhooks) delivery by hand.

    Bindbee's secret is NOT a base64 "whsec_" secret: its raw UTF-8 bytes are the
    HMAC key, so do not use the standardwebhooks or svix libraries here.
    signature = base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}." + raw_body))
    """
    if not webhook_id or not timestamp or not signature_header or not secret:
        return False
    if not TIMESTAMP_RE.match(timestamp):
        return False

    if tolerance_seconds > 0 and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False

    if secret.startswith("whsec_"):
        try:
            key = base64.b64decode(secret[len("whsec_"):])
        except (binascii.Error, ValueError):
            return False
    else:
        key = secret.encode("utf-8")
    if not key:
        return False  # fail closed

    signed_content = f"{webhook_id}.{timestamp}.".encode("utf-8") + raw_body
    expected = base64.b64encode(hmac.new(key, signed_content, hashlib.sha256).digest())

    # The header holds one or more space-separated "v1,<base64>" entries; ignore other versions
    for entry in signature_header.split(" "):
        version, sep, value = entry.partition(",")
        if sep and version == "v1" and hmac.compare_digest(value.encode("utf-8"), expected):
            return True
    return False


@app.post("/webhooks/bindbee")
async def bindbee_webhook(request: Request):
    # Raw body is required: the signature covers the exact bytes Bindbee sent
    raw_body = await request.body()
    tolerance = int(os.getenv("BINDBEE_WEBHOOK_TOLERANCE_SECONDS") or 0)

    if not verify_bindbee_signature(
        raw_body,
        request.headers.get("webhook-id"),
        request.headers.get("webhook-timestamp"),
        request.headers.get("webhook-signature"),
        os.getenv("BINDBEE_WEBHOOK_SECRET"),
        tolerance,
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # payload["id"] equals the webhook-id header: use it to dedupe retries.
    # payload["sequence"] orders events per connector (order is not guaranteed across syncs).
    event = payload.get("event")
    if event == "connector.linked":
        print("Connector linked:", payload.get("connector"))
    elif event == "connector.relinked":
        print("Connector relinked:", payload.get("connector"))
    elif event == "connector.relink_needed":
        print("Connector needs relink:", payload.get("connector"), payload.get("error"))
    elif event == "connector.sync.started":
        print("Sync started:", payload.get("sync"))
    elif event == "connector.sync.completed":
        print("Sync completed:", payload.get("sync"))
    elif event == "connector.sync.failed":
        print("Sync failed:", payload.get("sync"), payload.get("error"))
    elif event == "hris.employee.created":
        print("Employee created:", payload.get("data"))
    elif event == "hris.employee.updated":
        print("Employee updated:", payload.get("data"))
    else:
        print("Unhandled event:", event)

    return {"received": True}
