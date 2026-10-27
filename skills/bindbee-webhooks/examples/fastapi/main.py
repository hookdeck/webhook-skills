# Generated with: bindbee-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Bindbee Webhook Handler")

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set BINDBEE_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("BINDBEE_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "BINDBEE_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


class WebhookVerificationError(Exception):
    pass


def verify_bindbee_signature(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                             secret: str, tolerance: int | None = None) -> None:
    """Verify a Bindbee delivery (Standard Webhooks headers); raise if it's invalid.

    Written out by hand, not with the `standardwebhooks` or `svix` libraries: they base64-decode
    the secret, but Bindbee's secret is used as raw UTF-8 bytes. A secret that starts with
    `whsec_` is base64-decoded after the prefix, as Hookdeck does; any other secret is the key as-is.
    """
    if not (msg_id and timestamp and signature_header):
        raise WebhookVerificationError("Missing signature headers")
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):
        raise WebhookVerificationError("Invalid timestamp")
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        raise WebhookVerificationError("Timestamp outside tolerance")

    if secret.startswith("whsec_"):
        try:
            key = base64.b64decode(secret[len("whsec_"):])
        except (binascii.Error, ValueError) as exc:
            raise WebhookVerificationError("Secret is not valid base64") from exc
    else:
        key = secret.encode("utf-8")
    if not key:
        raise WebhookVerificationError("Empty signing key")  # fail closed

    # Signed content is f"{id}.{timestamp}.{body}", HMAC-SHA256, base64
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    # The header is a space-separated list of "v1,<base64>" entries; any match is valid, other versions are ignored
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature, validate=True)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return
    raise WebhookVerificationError("No matching signature")


# Data events are named <category>.<model>.<action>, e.g. hris.employee.created
DATA_EVENT = re.compile(r"(hris|ats|lms)\.([a-z_]+)\.(created|updated)")

# webhook-id is the event id and is identical on every retry: use it as the idempotency key.
# In-memory for the example; use a durable store (Redis, a database) in production.
seen_event_ids: set[str] = set()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# The dashboard's "Send test event" sends a HEAD request with no body; anything but a 5xx passes.
@app.head("/webhooks/bindbee")
async def bindbee_head():
    return Response(status_code=200)


@app.post("/webhooks/bindbee")
async def bindbee_webhook(
    request: Request,
    webhook_id: str = Header(None),
    webhook_timestamp: str = Header(None),
    webhook_signature: str = Header(None),
    # Fallback when webhook-id is absent
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None),
):
    secret = os.environ.get("BINDBEE_WEBHOOK_SECRET")
    if not secret:
        print("BINDBEE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if webhook_id:
        msg_id, timestamp, signature = webhook_id, webhook_timestamp, webhook_signature
    else:
        msg_id, timestamp, signature = svix_id, svix_timestamp, svix_signature
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify against the RAW body, never a re-serialized payload.
    body = await request.body()
    try:
        verify_bindbee_signature(body, msg_id, timestamp, signature, secret)
    except WebhookVerificationError as err:
        print(f"Webhook verification failed: {err}")
        detail = "Timestamp too old" if "outside tolerance" in str(err).lower() else "Invalid signature"
        # 401 is final for Bindbee: it won't retry a request that can't verify
        raise HTTPException(status_code=401, detail=detail)

    # Verified: now parse
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("event")  # top-level `event` (version 2)
    event_id = payload.get("id")
    if event_id in seen_event_ids:
        return JSONResponse(content={"received": True, "duplicate": True, "event": event_type}, status_code=200)
    seen_event_ids.add(event_id)

    connector = (payload.get("connector") or {}).get("id")
    sync_id = (payload.get("sync") or {}).get("sync_id")
    error_message = (payload.get("error") or {}).get("message")
    if event_type == "connector.linked":
        print(f"Connector linked: {connector} {(payload.get('connector') or {}).get('origin_id')}")
    elif event_type == "connector.sync.started":
        print(f"Sync started: {connector} {sync_id}")
    elif event_type == "connector.sync.completed":
        # Every data event of this sync arrived before this one
        print(f"Sync completed: {connector} {sync_id}")
    elif event_type == "connector.sync.failed":
        print(f"Sync failed: {connector} {error_message}")
    elif event_type == "connector.relink_needed":
        # The one event that means your customer has to act: ask them to reconnect
        print(f"Relink needed: {connector} {error_message}")
    elif event_type == "connector.relinked":
        print(f"Connector relinked: {connector}")
    else:
        data = DATA_EVENT.fullmatch(str(event_type))
        if data:
            # `data` is an array of record IDs; read them with the `ids` filter on the model's endpoint
            ids = payload.get("data") or []
            print(f"{data[1]} {payload.get('model') or data[2]} {data[3]}: {len(ids)} record id(s), sequence {payload.get('sequence')}")
        else:
            print(f"Unhandled Bindbee event: {event_type}")

    # Respond 200 as soon as the signature verifies; do real work after responding / on a queue
    return JSONResponse(content={"received": True, "event": event_type}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
