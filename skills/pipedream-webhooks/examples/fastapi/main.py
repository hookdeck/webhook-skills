# Generated with: pipedream-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

# Pipedream recommends rejecting signatures older than 5 minutes.
TOLERANCE_SECONDS = 300
_DECIMAL = re.compile(r"[0-9]+")


def parse_signature_header(header: str) -> tuple[str | None, list[str]]:
    """Parse x-pd-signature: "t=<unix seconds>,v1=<hex>".

    Collects every v1 value so a future multi-signature header still verifies.
    """
    timestamp = None
    signatures: list[str] = []
    for part in header.split(","):
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        key, value = key.strip(), value.strip()
        if key == "t":
            timestamp = value
        elif key == "v1" and value:
            signatures.append(value.lower())
    return timestamp, signatures


def verify_pipedream_signature(
    raw_body: bytes,
    header: str | None,
    signing_key: str,
    tolerance_seconds: int = TOLERANCE_SECONDS,
    now: int | None = None,
) -> tuple[bool, str | None]:
    """Verify a Pipedream Connect trigger webhook.

    Signed content: f"{t}.{raw_body}" (the raw bytes, not re-serialised JSON)
    Algorithm:      HMAC-SHA256 keyed with the signing key (UTF-8), hex digest
    """
    if not header:
        return False, "Missing x-pd-signature header"

    timestamp, signatures = parse_signature_header(header)
    if not timestamp or not _DECIMAL.fullmatch(timestamp) or not signatures:
        return False, "Malformed x-pd-signature header"

    # t is part of the signed content, so a replayed request can't refresh it.
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > tolerance_seconds:
        return False, "Timestamp outside tolerance"

    expected = hmac.new(
        signing_key.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()

    if any(hmac.compare_digest(expected, sig) for sig in signatures):
        return True, None
    return False, "Invalid signature"


@app.post("/webhooks/pipedream")
async def pipedream_trigger_webhook(
    request: Request,
    x_pd_signature: str | None = Header(default=None),
):
    """Trigger webhooks: events emitted by deployed triggers. Signed with x-pd-signature."""
    signing_key = os.environ.get("PIPEDREAM_WEBHOOK_SIGNING_KEY")
    if not signing_key:
        print("PIPEDREAM_WEBHOOK_SIGNING_KEY is not set")
        return JSONResponse({"error": "Signing key not configured"}, status_code=500)

    # Read the raw body: the signature covers the exact bytes Pipedream sent.
    raw_body = await request.body()
    valid, error = verify_pipedream_signature(raw_body, x_pd_signature, signing_key)
    if not valid:
        print(f"Pipedream signature verification failed: {error}")
        return JSONResponse({"error": error}, status_code=400)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON payload"}, status_code=400)

    # The body is whatever the deployed trigger emitted, so its shape depends on
    # the trigger (e.g. gitlab-new-issue emits a GitLab issue). There is no
    # Pipedream-level event type field: route on the trigger the URL belongs to.
    # In production: store the event, return 2xx, then process asynchronously.
    print(f"Pipedream trigger event received: {json.dumps(event)[:200]}")

    return {"received": True}


@app.post("/webhooks/pipedream/connect")
async def pipedream_connection_webhook(request: Request, token: str = ""):
    """Connection webhooks: sent to a Connect token's webhook_uri. NOT signed by Pipedream."""
    # Pipedream doesn't sign these, so the only protection is a secret you put in
    # the webhook_uri yourself. Treat the payload as a hint and confirm it with
    # the Retrieve Account API before trusting it.
    expected_token = os.environ.get("PIPEDREAM_CONNECT_WEBHOOK_TOKEN")
    if expected_token and not hmac.compare_digest(token.encode(), expected_token.encode()):
        return JSONResponse({"error": "Invalid token"}, status_code=400)

    try:
        event = json.loads(await request.body())
    except ValueError:
        return JSONResponse({"error": "Invalid JSON payload"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid JSON payload"}, status_code=400)

    event_type = event.get("event")
    if event_type == "CONNECTION_SUCCESS":
        # Credentials are not in the payload; fetch them with Retrieve Account.
        account = event.get("account") or {}
        print(f"Account {account.get('id')} connected for {account.get('external_id')}")
    elif event_type == "CONNECTION_ERROR":
        print(f"Connection failed for token {event.get('connect_token')}: {event.get('error')}")
    else:
        print(f"Unhandled Pipedream connection event: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
