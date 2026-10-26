# Generated with: theirstack-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

def verify_theirstack_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a TheirStack webhook signature.

    TheirStack signs the RAW request body with HMAC-SHA256 keyed on the webhook's
    signing secret and sends "sha256=<hex>" in X-TheirStack-Signature-256.
    """
    if not secret or not signature_header or not signature_header.startswith("sha256="):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Compare as bytes: hmac.compare_digest raises TypeError on non-ASCII str,
    # which would turn a bad header into a 500 instead of a 401.
    received = signature_header[len("sha256="):].lower().encode("utf-8")
    return hmac.compare_digest(received, expected.encode("utf-8"))


@app.post("/webhooks/theirstack")
async def theirstack_webhook(request: Request):
    # Raw body for signature verification (do not parse first)
    raw_body = await request.body()
    signature = request.headers.get("x-theirstack-signature-256")

    # Verify first, parse second
    if not verify_theirstack_webhook(
        raw_body, signature, os.environ.get("THEIRSTACK_WEBHOOK_SECRET")
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Envelope: { id, type, payload }. The event name is in the body, not a header.
    event_id = event.get("id")
    event_type = event.get("type")
    payload = event.get("payload") or {}
    print(f"Received TheirStack event: {event_type} ({event_id})")

    if event_type == "job.new":
        print("New job:", payload.get("job_title"), payload.get("company_domain"))
        # TODO: Add to CRM, alert sales, etc. Dedupe on payload["id"].
    elif event_type == "company.new":
        print("New company:", payload.get("name"), payload.get("domain"))
        # TODO: Create a lead, enrich, etc.
    elif event_type == "job.closed":
        # Minimal payload: { id, closed_at }
        print("Job closed:", payload.get("id"), payload.get("closed_at"))
        # TODO: Mark the job as closed in your system.
    elif event_type == "tech.new":
        print("New technology detected for company")
        # TODO: Update technographic records (access is by request).
    else:
        print(f"Unhandled event type: {event_type}")

    # Any 2xx acknowledges receipt; failures are retried hourly for 48 hours
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
