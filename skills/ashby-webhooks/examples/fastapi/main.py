# Generated with: ashby-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

ashby_secret = os.environ.get("ASHBY_WEBHOOK_SECRET")


def verify_ashby_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify an Ashby webhook signature.

    Ashby signs the RAW request body with HMAC-SHA256 keyed on your per-webhook
    secret token, hex-encoded, sent in the Ashby-Signature header as "sha256=<hex>".
    """
    # Header format: "sha256=<hex>"
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha256" or not sig:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(sig, expected_signature)


@app.post("/webhooks/ashby")
async def ashby_webhook(request: Request):
    # Get the raw body for signature verification (do not parse first)
    raw_body = await request.body()
    signature_header = request.headers.get("ashby-signature")

    # Verify webhook signature before parsing
    if not verify_ashby_webhook(raw_body, signature_header, ashby_secret):
        # Ashby does not retry a 401, so a wrong secret drops deliveries. Alert on
        # verification failures. If this happens on the ping sent when the webhook
        # is created or edited, Ashby saves the webhook disabled. See
        # references/verification.md.
        print("Webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification.
    # Every Ashby payload is { "action": "<eventName>", "data": {...} }.
    payload = json.loads(raw_body)
    action = payload.get("action")
    data = payload.get("data", {})

    print(f"Received Ashby event: {action}")

    # Dispatch on the action (event name), NOT on a header.
    if action == "ping":
        print("Ping received — endpoint is reachable")

    elif action == "applicationSubmit":
        print(f"Application submitted: {data.get('application', {}).get('id')}")
        # Your code: Sync candidate, notify recruiters, etc.

    elif action == "applicationUpdate":
        print(f"Application updated: {data.get('application', {}).get('id')}")
        # Your code: Keep external systems in sync.

    elif action == "candidateHire":
        print(f"Candidate hired, application: {data.get('application', {}).get('id')}")
        # Your code: Trigger onboarding, HRIS provisioning, etc.
        # Note: candidateHire also fans out applicationUpdate + candidateStageChange.

    elif action == "candidateStageChange":
        print(f"Candidate stage changed, application: {data.get('application', {}).get('id')}")
        # Your code: Pipeline analytics, Slack alerts, etc.

    elif action == "interviewScheduleCreate":
        print(f"Interview schedule created: {data.get('interviewSchedule', {}).get('id')}")
        # Your code: Calendar sync, interviewer prep, etc.

    elif action == "offerCreate":
        print(f"Offer created: {data.get('offer', {}).get('id')}")
        # Your code: Offer tracking, approvals, etc.

    else:
        print(f"Unhandled event: {action}")

    # Return 200 to acknowledge receipt. Ashby retries non-2xx responses except 401, 403, 404, 405 and 410.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
