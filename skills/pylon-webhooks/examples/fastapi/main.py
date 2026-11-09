# Generated with: pylon-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

pylon_secret = os.environ.get("PYLON_WEBHOOK_SECRET", "")

# Pylon's docs tell receivers to reject a timestamp more than 5 minutes from now.
# Retries are re-signed with a fresh timestamp, so they pass this check.
TOLERANCE_SECONDS = 5 * 60


def verify_pylon_webhook(
    raw_body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
    secret: str,
    now: Optional[float] = None,
) -> bool:
    """Verify a Pylon webhook (X-Pylon-Signature-V2).

    Pylon signs `timestamp + "." + raw_body` with HMAC-SHA256, keyed with the
    webhook secret used as-is (do not hex-decode it), and sends the hex digest in
    X-Pylon-Signature-V2. The timestamp is in X-Pylon-Timestamp (Unix seconds).
    """
    if not timestamp or not signature or not secret:
        return False

    try:
        sent_at = int(timestamp)
    except ValueError:
        return False
    if abs((time.time() if now is None else now) - sent_at) > TOLERANCE_SECONDS:
        return False

    signed = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()

    # Timing-safe comparison on bytes (compare_digest raises on non-ASCII str input)
    return hmac.compare_digest(expected.encode("utf-8"), signature.encode("utf-8"))


# Pylon lets you pick the method per webhook; POST is the default.
@app.post("/webhooks/pylon")
async def pylon_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first)
    raw_body = await request.body()
    timestamp = request.headers.get("x-pylon-timestamp")
    signature = request.headers.get("x-pylon-signature-v2")
    retry_number = request.headers.get("x-pylon-retry-number")  # retries only

    if not verify_pylon_webhook(raw_body, timestamp, signature, pylon_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    payload = json.loads(raw_body)

    # Pylon's "Test" button sends this body.
    if isinstance(payload.get("data"), dict) and payload["data"].get("type") == "ping":
        print("Received Pylon test ping")
        return {"received": True}

    # The body is the JSON template you wrote in the trigger's Send webhook
    # action, so these field names are yours. Every value arrives as a string.
    # This example uses the template from Pylon's docs.
    retry = f" [retry {retry_number}]" if retry_number else ""
    print(
        f"Received Pylon webhook for issue {payload.get('issue_id')} "
        f"(#{payload.get('number')}): {payload.get('title')}{retry}"
    )

    # TODO: Pylon sends no event ID, so de-duplicate on fields from your
    # template (for example issue_id plus the field that changed).

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
