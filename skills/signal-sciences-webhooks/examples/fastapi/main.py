# Generated with: signal-sciences-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_signal_sciences_webhook(raw_body: bytes, signature_header: str | None, signing_key: str | None) -> bool:
    """Verify X-SigSci-Signature: hex HMAC-SHA256 of the raw JSON body.

    The key is the integration's signing key used as a raw string.
    There is no timestamp or prefix.
    """
    if not signature_header or not signing_key:
        return False

    expected = hmac.new(
        signing_key.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header.strip().lower(), expected)


@app.post("/webhooks/signal-sciences")
async def signal_sciences_webhook(request: Request):
    # Raw body is required: the signature covers the exact bytes Fastly sent
    raw_body = await request.body()
    signature = request.headers.get("x-sigsci-signature")

    if not verify_signal_sciences_webhook(raw_body, signature, os.environ.get("SIGNAL_SCIENCES_SIGNING_KEY")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse after verification. The event name is the `type` field in the body.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    payload = event.get("payload")
    print(f"Received {event_type} event for {event.get('workspaceId')}")

    if event_type == "flag":
        print(f"IP flagged: {payload} {event.get('link')}")
        # TODO: Alert, add to external blocklist, etc.

    elif event_type == "expireFlag":
        print(f"IP flag expired: {payload}")
        # TODO: Remove from external blocklist

    elif event_type == "agentAlert":
        print(f"Agent alert: {payload}")
        # TODO: Page on-call

    elif event_type == "loggingModeChanged":
        print(f"Agent mode changed: {payload}")
        # TODO: Alert if protection was turned off

    elif event_type in ("ruleCreated", "ruleUpdated", "ruleDeleted"):
        print(f"Request rule change ({event_type}): {payload}")
        # TODO: Record in audit log

    elif event_type in ("listCreated", "listUpdated", "listDeleted"):
        print(f"List change ({event_type}): {payload}")

    else:
        print(f"Unhandled event: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
