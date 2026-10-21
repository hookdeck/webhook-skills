# Generated with: bolt-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_bolt_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    """Bolt sends base64(HMAC-SHA256(raw_body, signing_secret)) in X-Bolt-Hmac-Sha256."""
    if not hmac_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(expected.encode(), hmac_header.encode())


@app.post("/webhooks/bolt")
async def bolt_webhook(
    request: Request,
    x_bolt_hmac_sha256: str = Header(None),
):
    # Use the raw body - parsing JSON first would change the signed bytes
    raw_body = await request.body()

    if not x_bolt_hmac_sha256:
        raise HTTPException(status_code=400, detail="Missing X-Bolt-Hmac-Sha256 header")

    secret = os.getenv("BOLT_SIGNING_SECRET", "")
    if not verify_bolt_webhook(raw_body, x_bolt_hmac_sha256, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Bolt has no event ID; dedupe on type + transaction id before side effects
    event_type = event.get("type")
    data = event.get("data") or {}
    print(f"Received Bolt {event_type} webhook ({event.get('object')})")

    if event_type == "pending":
        print("Transaction pending fraud review:", data.get("reference"))
    elif event_type == "payment":
        print("Payment captured:", data.get("reference"), data.get("amount"))
        # TODO: Mark order as paid (automatic capture)
    elif event_type == "auth":
        print("Transaction authorized:", data.get("reference"))
        # TODO: Begin the capture process (manual capture)
    elif event_type == "capture":
        print("Manual capture succeeded:", data.get("reference"))
    elif event_type == "credit":
        print("Refund processed:", data.get("reference"))
    elif event_type == "void":
        print("Transaction voided:", data.get("reference"))
    elif event_type == "failed_payment":
        print("Payment failed pre-authorization:", data.get("reference"))
    elif event_type == "rejected_irreversible":
        print("Transaction permanently rejected:", data.get("reference"))
    elif event_type == "rejected_reversible":
        print("Transaction rejected (re-review possible):", data.get("reference"))
    elif event_type == "risk_insights":
        print("Risk insights available:", data.get("reference"))
    elif event_type == "newsletter_subscription":
        print("Newsletter subscription:", data.get("reference"))
    elif event_type == "credit_card_deleted":
        print("Saved credit card deleted (beta):", (data.get("user") or {}).get("id"))
    else:
        print(f"Unhandled Bolt event type: {event_type}")

    # Return 200 with a JSON body; non-200 or non-JSON responses are retried
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
