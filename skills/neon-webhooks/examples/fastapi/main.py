# Generated with: neon-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import json
import os
import time

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

NEON_AUTH_URL = os.environ.get("NEON_AUTH_URL", "")
JWKS_URL = f"{NEON_AUTH_URL}/.well-known/jwks.json"
TOLERANCE_MS = 5 * 60 * 1000  # reject webhooks older than 5 minutes

# Cache public keys by `kid` so we don't fetch the JWKS on every request.
_key_cache: dict[str, Ed25519PublicKey] = {}


def _b64url_decode(data: str) -> bytes:
    """Decode base64url, restoring any stripped padding."""
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _b64url_encode(data: bytes) -> str:
    """Encode base64url without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _fetch_jwks() -> dict:
    """Fetch the JWKS document. Overridden in tests."""
    return httpx.get(JWKS_URL, timeout=5.0).json()


def _get_public_key(kid: str) -> Ed25519PublicKey:
    if kid in _key_cache:
        return _key_cache[kid]

    jwks = _fetch_jwks()
    jwk = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if jwk is None:
        raise ValueError(f"Key {kid} not found in JWKS")

    key = Ed25519PublicKey.from_public_bytes(_b64url_decode(jwk["x"]))
    _key_cache[kid] = key
    return key


def verify_neon_webhook(raw_body: bytes, headers) -> dict:
    """Verify a Neon Auth webhook (EdDSA / Ed25519 detached JWS).

    Returns the parsed JSON body, or raises ValueError on any failure.
    """
    signature = headers.get("x-neon-signature")
    kid = headers.get("x-neon-signature-kid")
    timestamp = headers.get("x-neon-timestamp")

    if not signature or not kid or not timestamp:
        raise ValueError("Missing Neon signature headers")

    # X-Neon-Signature is a detached JWS: "header..signature" (empty middle section).
    parts = signature.split(".")
    if len(parts) != 3 or parts[1] != "":
        raise ValueError("Expected detached JWS (header..signature)")
    header_b64, _, signature_b64 = parts

    public_key = _get_public_key(kid)

    # Reconstruct the signing input with DOUBLE base64url encoding.
    # A naive f"{timestamp}.{body}" reconstruction will always fail.
    payload_b64 = _b64url_encode(raw_body)
    inner = f"{timestamp}.{payload_b64}"  # X-Neon-Timestamp is in MILLISECONDS
    signing_input = f"{header_b64}.{_b64url_encode(inner.encode())}"

    try:
        public_key.verify(_b64url_decode(signature_b64), signing_input.encode())
    except InvalidSignature:
        raise ValueError("Invalid signature")

    # Replay protection: reject stale timestamps.
    if int(time.time() * 1000) - int(timestamp) > TOLERANCE_MS:
        raise ValueError("Timestamp too old")

    return json.loads(raw_body)  # parse only AFTER verifying


@app.post("/webhooks/neon")
async def neon_webhook(request: Request):
    raw_body = await request.body()

    try:
        verify_neon_webhook(raw_body, request.headers)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Webhook Error: {e}")

    # Idempotency: dedupe on X-Neon-Event-Id before doing real work.
    event_id = request.headers.get("x-neon-event-id")
    event_type = request.headers.get("x-neon-event-type")

    # Handle the event based on type. Blocking events (send.otp, send.magic_link,
    # user.before_create) pause the auth flow until this responds, so keep them fast.
    if event_type == "send.otp":
        print(f"Send OTP (blocking): {event_id}")
        # Your code: deliver event_data.otp_code via your own SMS/email provider.

    elif event_type == "send.magic_link":
        print(f"Send magic link (blocking): {event_id}")
        # Your code: deliver event_data.link_url via your own channel.

    elif event_type == "user.before_create":
        print(f"User before create (blocking): {event_id}")
        # Neon reads this response: a 2xx with a JSON `allowed` field. Any other
        # response, or a failed delivery, rejects the signup.
        # Your code: decide whether to allow the signup, for example:
        # return {"allowed": False, "error_message": "Signups from this domain are not allowed.", "error_code": "DOMAIN_BLOCKED"}
        return {"allowed": True}

    elif event_type == "user.created":
        print(f"User created: {event_id}")
        # Your code: sync the user to your database, CRM, analytics, etc.

    elif event_type == "phone_number.verified":
        print(f"Phone number verified: {event_id}")
        # Your code: unlock features, update profile state, etc.

    elif event_type == "organization.invitation.created":
        print(f"Organization invitation created: {event_id}")
        # Your code: send a custom invitation email to event_data.invitee_email.

    elif event_type == "organization.invitation.accepted":
        print(f"Organization invitation accepted: {event_id}")
        # Your code: provision resources for the new member.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx to acknowledge receipt. Neon ignores the body for these events.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
