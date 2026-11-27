# Generated with: nmi-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Header, HTTPException

load_dotenv()

app = FastAPI()

nmi_signing_key = os.environ.get("NMI_SIGNING_KEY")


def verify_nmi_webhook(raw_body: bytes, signature_header: str, signing_key: str) -> bool:
    """Verify an NMI (Network Merchants) webhook.

    NMI does NOT use Standard Webhooks. Each delivery carries a single header:

        Webhook-Signature: t=<nonce>,s=<lowercase-hex-hmac>

    IMPORTANT: NMI calls ``t`` a nonce and documents no replay/age window, so
    don't parse it as a Unix time. The signature ``s`` is HMAC-SHA256 over
    "<nonce>.<raw_body>", keyed with the webhooks signing key, hex-encoded
    (lowercase). We hash the raw, unparsed body -- re-serializing the JSON would
    break the HMAC.
    """
    if not signing_key:
        return False

    # Parse "t=<nonce>,s=<hex>" into a dict. Split each segment at the FIRST '='
    # so a value containing '=' is preserved, and don't rely on ordering.
    parts = {}
    for seg in (signature_header or "").split(","):
        key, sep, value = seg.partition("=")
        if sep:
            parts[key.strip()] = value.strip()

    nonce = parts.get("t")
    signature = parts.get("s")
    if not nonce or not signature:
        return False

    signed = nonce.encode("utf-8") + b"." + raw_body
    expected = hmac.new(
        signing_key.encode("utf-8"),
        signed,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe compare.
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/nmi")
async def nmi_webhook(request: Request, webhook_signature: str = Header(default=None)):
    # Read the raw body -- required for signature verification.
    raw_body = await request.body()

    if not webhook_signature:
        raise HTTPException(status_code=400, detail="Missing Webhook-Signature header")

    # Verify before parsing.
    if not verify_nmi_webhook(raw_body, webhook_signature, nmi_signing_key):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Safe to parse now that the signature checks out.
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_id = event.get("event_id")
    event_type = event.get("event_type", "")
    print(f"Received {event_type} (event_id {event_id})")

    # Event names are dotted: transaction.<action>.<result>. Dispatch on the
    # action segment; return 200 quickly and do slow work asynchronously.
    parts = event_type.split(".")
    action = parts[1] if len(parts) > 1 else ""

    if action == "sale":
        pass  # Your code: fulfil order / send receipt on success, dunning on failure
    elif action == "auth":
        pass  # Your code: hold order while funds are authorized
    elif action == "capture":
        pass  # Your code: mark order paid, fulfil
    elif action == "void":
        pass  # Your code: release hold, cancel order
    elif action == "refund":
        pass  # Your code: reverse fulfilment, notify customer
    elif action == "credit":
        pass  # Your code: payout/adjustment bookkeeping
    elif action == "validate":
        pass  # Your code: save card on file
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge quickly so NMI does not retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
