# Generated with: fusionauth-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hashlib
import base64
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
import jwt

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("FUSIONAUTH_WEBHOOK_SECRET")


def verify_fusionauth_webhook(raw_body: bytes, signature_jwt: str, secret: str) -> bool:
    """
    Verify FusionAuth webhook signature.
    FusionAuth sends a JWT in X-FusionAuth-Signature-JWT header containing
    a request_body_sha256 claim with the Base64-encoded SHA-256 hash of the body.
    """
    if not signature_jwt or not secret:
        return False

    try:
        # Verify and decode JWT (PyJWT handles HMAC verification)
        payload = jwt.decode(
            signature_jwt,
            secret,
            algorithms=["HS256", "HS384", "HS512"]
        )

        # Calculate SHA-256 hash of request body (base64 encoded)
        body_hash = base64.b64encode(hashlib.sha256(raw_body).digest()).decode()

        # Compare hash from JWT claim with calculated hash
        return payload.get("request_body_sha256") == body_hash
    except jwt.InvalidTokenError as e:
        print(f"JWT verification failed: {e}")
        return False


@app.post("/webhooks/fusionauth")
async def fusionauth_webhook(request: Request):
    # Get the raw body for signature verification
    payload = await request.body()
    signature_jwt = request.headers.get("x-fusionauth-signature-jwt")

    # Verify signature if secret is configured
    if webhook_secret:
        if not verify_fusionauth_webhook(payload, signature_jwt, webhook_secret):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the verified webhook body
    try:
        import json
        event = json.loads(payload.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Handle the event based on type
    event_type = event.get("event", {}).get("type")
    user = event.get("event", {}).get("user", {})
    application_id = event.get("event", {}).get("applicationId")

    if event_type == "user.create":
        print(f"User created: {user.get('id')}")
        # TODO: Sync user to external systems, send welcome email, etc.

    elif event_type == "user.update":
        print(f"User updated: {user.get('id')}")
        # TODO: Sync user changes to external systems

    elif event_type == "user.delete":
        print(f"User deleted: {user.get('id')}")
        # TODO: Clean up user data, handle GDPR compliance

    elif event_type == "user.deactivate":
        print(f"User deactivated: {user.get('id')}")
        # TODO: Revoke access, notify admins

    elif event_type == "user.reactivate":
        print(f"User reactivated: {user.get('id')}")
        # TODO: Restore access

    elif event_type == "user.login.success":
        print(f"User logged in: {user.get('id')}")
        # TODO: Audit logging, session tracking

    elif event_type == "user.login.failed":
        print(f"Login failed for: {user.get('email', 'unknown')}")
        # TODO: Security monitoring, rate limiting

    elif event_type == "user.registration.create":
        print(f"User registered: {user.get('id')} for app: {application_id}")
        # TODO: Provision app-specific access

    elif event_type == "user.registration.update":
        print(f"Registration updated: {user.get('id')}")
        # TODO: Sync role changes

    elif event_type == "user.registration.delete":
        print(f"Registration deleted: {user.get('id')}")
        # TODO: Revoke app access

    elif event_type == "user.email.verified":
        print(f"Email verified for: {user.get('id')}")
        # TODO: Enable features requiring verified email

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
