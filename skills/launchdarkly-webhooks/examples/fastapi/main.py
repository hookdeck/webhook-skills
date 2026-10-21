# Generated with: launchdarkly-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_launchdarkly_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify X-LD-Signature: HMAC-SHA256 hex digest of the raw body, keyed with the secret."""
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)


@app.post("/webhooks/launchdarkly")
async def launchdarkly_webhook(request: Request):
    secret = os.environ.get("LAUNCHDARKLY_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw body: the signature covers the exact bytes LaunchDarkly sent
    raw_body = await request.body()
    signature = request.headers.get("x-ld-signature")

    if not signature:
        # Signing is optional in LaunchDarkly; the webhook must have a secret
        raise HTTPException(status_code=400, detail="Missing X-LD-Signature header")

    if not verify_launchdarkly_webhook(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The payload is an audit log entry; the event type is `kind`
    kind = payload.get("kind")
    accesses = payload.get("accesses") or [{}]
    print(f"Received {kind} change ({accesses[0].get('action')}), id {payload.get('_id')}")

    if kind == "flag":
        print(f"Flag \"{payload.get('name')}\": {payload.get('titleVerb')}")
        # TODO: sync flag state, notify team, update ticket
    elif kind == "segment":
        print(f"Segment \"{payload.get('name')}\": {payload.get('titleVerb')}")
        # TODO: invalidate caches
    elif kind == "project":
        print(f"Project \"{payload.get('name')}\": {payload.get('titleVerb')}")
    elif kind == "environment":
        print(f"Environment \"{payload.get('name')}\": {payload.get('titleVerb')}")
    else:
        print(f"Unhandled kind: {kind}")

    # Dedupe on payload["_id"]; delivery order is not guaranteed (use payload["date"])
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
