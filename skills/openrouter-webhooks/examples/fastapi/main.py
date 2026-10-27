# Generated with: openrouter-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response

load_dotenv()

app = FastAPI()

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_openrouter_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance_seconds: int = 0,
) -> bool:
    """Verify an X-OpenRouter-Signature header: t=<unix seconds>,v1=<hex>.

    v1 is HMAC-SHA256 (hex) of the bytes "<t>," + raw body, keyed with the
    workspace signing secret (UTF-8, used as-is). OpenRouter has no Python
    verification helper, so verify manually.

    Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
    original timestamp, so a window is off unless tolerance_seconds > 0.
    """
    if not header or not secret:
        return False

    timestamp = None
    signatures = []
    for part in header.split(","):
        part = part.strip()
        if part.startswith("t="):
            if timestamp is None:
                timestamp = part[2:]
        elif part.startswith("v1="):
            signatures.append(part[3:])

    if not timestamp or not signatures:
        return False

    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False

    # Build the signed message as bytes: "<t>," + raw body (never a re-encoded string)
    try:
        signed_payload = b"".join([timestamp.encode("latin-1"), b",", raw_body])
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest().encode()

    # Validate format first, then compare bytes in constant time (hex is
    # case-insensitive). Any matching v1 is valid.
    valid = False
    for sig in signatures:
        if not HEX_64.fullmatch(sig):
            continue
        if hmac.compare_digest(expected, sig.lower().encode()):
            valid = True
    return valid


@app.post("/webhooks/openrouter")
async def openrouter_webhook(request: Request):
    # Get the raw body for signature verification
    payload = await request.body()
    tolerance = int(os.environ.get("OPENROUTER_WEBHOOK_TOLERANCE_SECONDS") or 0)

    if not verify_openrouter_signature(
        payload,
        request.headers.get("x-openrouter-signature"),
        os.environ.get("OPENROUTER_WEBHOOK_SECRET", ""),
        tolerance,
    ):
        print("OpenRouter webhook verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Deduplicate retries on this header (e.g. "<job id>-completed")
    idempotency_key = request.headers.get("x-openrouter-idempotency-key")
    event_type = event.get("type") if isinstance(event, dict) else None
    job = (event.get("data") if isinstance(event, dict) else None) or {}

    # Handle the event based on type
    if event_type == "video.generation.completed":
        urls = job.get("unsigned_urls") or []
        print(f"Video ready: id={job.get('id')} key={idempotency_key} url={urls[0] if urls else None}")
        # TODO: Store the job and download the video (send your bearer token if the URL is on the OpenRouter API)

    elif event_type == "video.generation.failed":
        print(f"Video failed: id={job.get('id')} key={idempotency_key} error={job.get('error')}")
        # TODO: Mark the job failed and notify the user

    elif event_type == "video.generation.cancelled":
        print(f"Video cancelled: id={job.get('id')} key={idempotency_key}")
        # TODO: Mark the job cancelled

    elif event_type == "video.generation.expired":
        print(f"Video expired: id={job.get('id')} key={idempotency_key}")
        # TODO: Mark the job expired and resubmit if needed

    else:
        print(f"Unhandled event type: {event_type}")

    # 204 acknowledges a valid delivery
    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
