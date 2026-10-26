# Generated with: basin-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_basin_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a Basin webhook signature.

    Basin sends ``X-Basin-Signature: sha256=<hex>`` where <hex> is the HMAC-SHA256 of the
    raw request body, keyed with the webhook signing secret (Growth plan and above).
    Both sides are compared as bytes so a non-ASCII header is rejected, not a 500.
    """
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    received = signature_header[len("sha256="):].lower().encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("utf-8")
    return hmac.compare_digest(received, expected)


def parse_submission(raw_body: bytes, content_type: str | None) -> dict:
    """Parse the submission: JSON, data-wrapped JSON, or form-urlencoded."""
    text = raw_body.decode("utf-8")
    if "json" in (content_type or "").lower() or text.lstrip().startswith("{"):
        payload = json.loads(text)
    else:
        payload = dict(parse_qsl(text, keep_blank_values=True))
    if not isinstance(payload, dict):
        raise ValueError("submission must be an object")
    data = payload.get("data")
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        return dict(parse_qsl(data, keep_blank_values=True))
    return payload


# Basin has no event types: every webhook is a form submission.
@app.post("/webhooks/basin")
async def basin_webhook(request: Request):
    secret = os.environ.get("BASIN_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw body BEFORE parsing: the signature covers the exact bytes (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-basin-signature")

    if not verify_basin_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        submission = parse_submission(raw_body, request.headers.get("content-type"))
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid body")

    # Use the submission id for idempotency (Basin retries failed deliveries up to 15 times)
    print(f"Basin form submission {submission.get('id', '(no id)')} from {submission.get('email', 'unknown')}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
