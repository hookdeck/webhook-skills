# Generated with: bridge-xyz-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import os
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

# Reject events whose signature timestamp is older than this (replay protection).
TOLERANCE_MS = 10 * 60 * 1000  # 10 minutes


def get_public_key() -> str:
    """The per-endpoint RSA public key (PEM) from the Bridge webhook API response.

    Stored single-line with \\n escapes in the env var; convert back to newlines.
    """
    return os.environ.get("BRIDGE_WEBHOOK_PUBLIC_KEY", "").replace("\\n", "\n")


def verify_bridge_signature(
    raw_body: bytes,
    header: str | None,
    public_key_pem: str,
    tolerance_ms: int = TOLERANCE_MS,
) -> bool:
    """Verify a Bridge `X-Webhook-Signature` header.

    Header format: `t=<timestamp_ms>,v0=<base64_signature>`
    Bridge signs with RSA-SHA256 over the SHA256 digest of `"<timestamp>.<raw_body>"`.
    The digest is passed as the message to an RSA-SHA256 verify, which hashes it a
    SECOND time — this matches Bridge's reference implementation exactly.
    """
    if not header or not public_key_pem:
        return False

    # Parse "t=<ms>,v0=<base64>" — split each pair on the FIRST '=' only, because
    # the base64 signature can contain '=' padding.
    parts: dict[str, str] = {}
    for pair in header.split(","):
        key, sep, value = pair.partition("=")
        if sep:
            parts[key] = value

    timestamp = parts.get("t")
    signature_b64 = parts.get("v0")
    if not timestamp or not signature_b64:
        return False

    # Replay protection: reject stale events.
    try:
        if int(time.time() * 1000) - int(timestamp) > tolerance_ms:
            return False
    except ValueError:
        return False

    try:
        signature = base64.b64decode(signature_b64)
    except (ValueError, TypeError):
        return False

    # SHA256 digest of "<timestamp>.<raw_body>"; verify() hashes it AGAIN with SHA256.
    digest = hashlib.sha256(f"{timestamp}.".encode() + raw_body).digest()

    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode())
        public_key.verify(signature, digest, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (InvalidSignature, ValueError):
        return False


@app.post("/webhooks/bridge-xyz")
async def bridge_webhook(request: Request):
    # Read the RAW body for signature verification — do not parse JSON first.
    raw_body = await request.body()
    signature = request.headers.get("x-webhook-signature")

    if not signature:
        return Response("Missing X-Webhook-Signature header", status_code=400)

    if not verify_bridge_signature(raw_body, signature, get_public_key()):
        # Return non-2xx so Bridge retries delivery.
        return Response("Invalid signature", status_code=400)

    # Signature is valid — safe to parse.
    try:
        import json

        event = json.loads(raw_body)
    except ValueError:
        return Response("Invalid JSON", status_code=400)

    # Events are named "<category>.<action>", e.g. "customer.updated.status_transitioned".
    event_type = event.get("event_type") or event.get("type")
    object_id = event.get("event_object_id")

    if event_type == "customer.created":
        print(f"Customer created: {object_id}")
        # Your code: provision the account, begin onboarding
    elif event_type == "customer.updated.status_transitioned":
        print(f"Customer status changed: {object_id}")
        # Your code: react to KYC approval/rejection, update customer state
    elif event_type == "kyc_link.updated.status_transitioned":
        print(f"KYC link status changed: {object_id}")
        # Your code: track KYC/ToS completion, unblock onboarding
    elif event_type == "transfer.created":
        print(f"Transfer created: {object_id}")
        # Your code: record the new transfer in your ledger
    elif event_type == "transfer.updated.status_transitioned":
        print(f"Transfer status changed: {object_id}")
        # Your code: update payment status, trigger fulfillment on settlement
    elif event_type == "virtual_account.activity.created":
        print(f"Virtual account activity: {object_id}")
        # Your code: reconcile incoming funds, credit a balance
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge receipt quickly.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
