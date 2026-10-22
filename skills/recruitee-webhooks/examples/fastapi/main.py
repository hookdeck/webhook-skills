# Generated with: recruitee-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_recruitee_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Recruitee webhook signature.

    Recruitee sends the hex HMAC-SHA256 of the RAW request body, keyed with the
    webhook secret, in the X-Recruitee-Signature header (no prefix, no timestamp).
    """
    if not signature_header or not secret:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected_signature.encode())


def is_test_request(parsed) -> bool:
    # Recruitee sends {"test":true} on "Verify and create" / "Test"; it only needs a 200.
    return isinstance(parsed, dict) and parsed.get("test") is True and "event_type" not in parsed


@app.post("/webhooks/recruitee")
async def recruitee_webhook(request: Request):
    # Raw body for signature verification (do not parse first)
    raw_body = await request.body()
    signature = request.headers.get("x-recruitee-signature")
    secret = os.environ.get("RECRUITEE_WEBHOOK_SECRET", "")

    # Verify the signature before parsing
    if not verify_recruitee_webhook(raw_body, signature, secret):
        # The bare test request may arrive unsigned; it carries no event data.
        if not signature:
            try:
                if is_test_request(json.loads(raw_body)):
                    return {"received": True}
            except ValueError:
                pass
        print("Webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Test request (signed): acknowledge without processing.
    if is_test_request(event):
        return {"received": True}

    # The event name is in the body: event_type (+ event_subtype), NOT a header.
    event_type = event.get("event_type")
    event_subtype = event.get("event_subtype")
    payload = event.get("payload") or {}
    candidate_id = (payload.get("candidate") or {}).get("id")
    offer_id = (payload.get("offer") or {}).get("id")
    print(f"Received Recruitee event: {event_type}/{event_subtype} (id {event.get('id')}, attempt {event.get('attempt_count')})")

    # Retries reuse the same id: dedupe on it in real handlers.
    if event_type == "new_candidate":
        print(f"New candidate: {candidate_id} ({event_subtype})")
        # TODO: Notify recruiters, sync to CRM, etc.
    elif event_type == "candidate_assigned":
        print(f"Candidate assigned to offer: {candidate_id} {offer_id}")
        # TODO: Track applications per job.
    elif event_type == "candidate_moved":
        details = payload.get("details") or {}
        # Disqualification arrives here, not as its own event_type.
        if event_subtype == "disqualified":
            print(f"Candidate disqualified: {candidate_id} {(details.get('disqualify_reason') or {}).get('name')}")
        elif event_subtype == "requalified":
            print(f"Candidate requalified: {candidate_id}")
        else:
            print(f"Candidate moved: {candidate_id} {(details.get('from_stage') or {}).get('name')} -> {(details.get('to_stage') or {}).get('name')}")
        # TODO: Pipeline analytics, Slack alerts, onboarding on the hire stage, etc.
    elif event_type == "candidate_deleted":
        print(f"Candidate deleted: {candidate_id}")
        # TODO: Erase the candidate in downstream systems.
    elif event_type == "offer_published":
        print(f"Job published: {offer_id}")
    elif event_type == "offer_unpublished":
        print(f"Job unpublished: {offer_id}")
    elif event_type == "offer_updated":
        print(f"Job updated: {offer_id} ({event_subtype})")
    else:
        print(f"Unhandled event: {event_type}")

    # Recruitee treats any status other than 200 as a failure and retries.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
