# Generated with: planning-center-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_planning_center(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Verify X-PCO-Webhooks-Authenticity: bare hex HMAC-SHA256 of the raw body.

    The authenticity_secret is the HMAC key as a UTF-8 string (do NOT hex-decode it).
    """
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header gives a mismatch (401), not a TypeError (500)
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def handle_event(name: str, attempt: int, payload: dict) -> None:
    if name == "people.v2.events.person.updated":
        data = (payload or {}).get("data", {})
        print(f"Person updated (attempt {attempt}): {data.get('id')} {data.get('attributes', {}).get('name')}")
    else:
        # Event names look like <app>.<version>.events.<resource>.<action>
        print(f"Unhandled event: {name}")


@app.post("/webhooks/planning-center")
async def planning_center_webhook(
    request: Request,
    x_pco_webhooks_authenticity: Optional[str] = Header(None),
):
    # Raw body: the signature covers the exact bytes received
    raw_body = await request.body()

    if not x_pco_webhooks_authenticity:
        raise HTTPException(status_code=400, detail="Missing X-PCO-Webhooks-Authenticity header")
    if not verify_planning_center(
        raw_body, x_pco_webhooks_authenticity, os.getenv("PLANNING_CENTER_AUTHENTICITY_SECRET")
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(raw_body)
        deliveries = body.get("data", []) if isinstance(body, dict) else []
        for delivery in deliveries:
            attrs = delivery.get("attributes", {})
            payload = attrs.get("payload")
            # attributes.payload is itself a JSON string
            parsed = json.loads(payload) if isinstance(payload, str) else payload
            handle_event(attrs.get("name"), attrs.get("attempt"), parsed)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Anything other than 200 is retried; a 410 deactivates the subscription
    return {"received": True}
