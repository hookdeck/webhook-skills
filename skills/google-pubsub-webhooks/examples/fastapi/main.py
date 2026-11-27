# Generated with: google-pubsub-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Google Cloud Pub/Sub push subscription webhook handler for FastAPI.

Pub/Sub has NO signing secret and NO HMAC header. On an authenticated push
subscription every request carries `Authorization: Bearer <OIDC JWT>`, signed by
Google. This handler verifies it with the official `google-auth` library, which
fetches and caches Google's public keys and checks the RS256 signature, `aud`,
and `exp`; the `iss`, `email`, and `email_verified` claims are checked here.

Because the token authenticates the CALLER and not the body, there is no
raw-body requirement — parsing JSON first is safe for Pub/Sub in a way it never
is for an HMAC provider.
"""
import base64
import binascii
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

load_dotenv()

app = FastAPI()

# Both forms are valid Google issuers and the official libraries accept either,
# so accept both rather than pinning one and rejecting a legitimate token.
GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")

# Status codes Pub/Sub treats as an acknowledgement: 102, 200, 201, 202, 204.
# Anything else (including a timeout) is a nack and the message is redelivered.
ACK_STATUS = 204

# One transport for the process: google-auth caches Google's certs on it.
_request = google_requests.Request()


def verify_push_jwt(authorization_header, audience, service_account_email):
    """Verify the OIDC token Pub/Sub attaches to an authenticated push subscription.

    Returns the token claims, or None if verification failed.
    """
    # RFC 9110 makes the auth scheme case-insensitive, so match it that way.
    scheme, _, token = (authorization_header or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    try:
        # Verifies the RS256 signature against Google's public keys, plus aud + exp.
        claims = id_token.verify_oauth2_token(token.strip(), _request, audience=audience)
    except Exception as exc:  # noqa: BLE001 - ValueError / GoogleAuthError
        print("Pub/Sub OIDC verification failed:", exc)
        return None

    # Checks the library does NOT do for you. Without the email check, any
    # Google-signed token with the right audience would be accepted.
    if claims.get("iss") not in GOOGLE_ISSUERS:
        return None
    if claims.get("email_verified") is not True:
        return None

    # Service account emails are case-insensitive: compare normalized so a casing
    # typo in config does not silently reject every message.
    token_email = claims.get("email")
    token_email = token_email.lower() if isinstance(token_email, str) else None
    if not token_email or token_email != service_account_email.strip().lower():
        return None

    return claims


def authenticate(request: Request):
    """Authenticate a push request.

    Fails closed: if the endpoint is configured with neither OIDC nor a URL
    token, requests are rejected unless PUBSUB_ALLOW_UNAUTHENTICATED is
    explicitly set (for the Pub/Sub emulator, which sends no Authorization
    header at all).

    Returns (claims, None) on success or (None, Response) on failure.
    """
    audience = os.environ.get("PUBSUB_AUDIENCE")
    service_account_email = os.environ.get("PUBSUB_SERVICE_ACCOUNT_EMAIL")
    verification_token = os.environ.get("PUBSUB_VERIFICATION_TOKEN")
    allow_unauthenticated = os.environ.get("PUBSUB_ALLOW_UNAUTHENTICATED") == "true"

    # Optional shared token embedded in the push endpoint URL (?token=...).
    # A shared-secret convention (Google uses the same env var in its App Engine
    # sample), not a signature scheme — see references/verification.md.
    if verification_token:
        provided = request.query_params.get("token", "")
        if not hmac.compare_digest(provided, verification_token):
            return None, Response("Invalid verification token", status_code=401)

    if service_account_email and audience:
        claims = verify_push_jwt(
            request.headers.get("authorization"), audience, service_account_email
        )
        if claims is None:
            return None, Response("Invalid OIDC token", status_code=401)
        return claims, None

    if verification_token or allow_unauthenticated:
        return None, None

    # Misconfiguration, not a bad request: refuse rather than accept anything.
    print(
        "Set PUBSUB_AUDIENCE + PUBSUB_SERVICE_ACCOUNT_EMAIL, PUBSUB_VERIFICATION_TOKEN, "
        "or PUBSUB_ALLOW_UNAUTHENTICATED=true."
    )
    return None, Response(
        "Endpoint is not configured to authenticate Pub/Sub push requests",
        status_code=500,
    )


def decode_data(data):
    """`message.data` is base64 and MAY be absent (attribute-only messages)."""
    if data is None:
        return None
    try:
        text = base64.b64decode(data).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text  # Pub/Sub payloads are arbitrary bytes, not necessarily JSON.


@app.post("/webhooks/google-pubsub")
async def pubsub_webhook(request: Request):
    # Authenticate before parsing anything.
    _claims, error = authenticate(request)
    if error is not None:
        return error

    # Pub/Sub sends Content-Type: application/json. Unlike HMAC webhooks there
    # is no body signature, so there is no need to capture the raw body.
    try:
        envelope = json.loads(await request.body())
    except json.JSONDecodeError:
        return Response("Invalid JSON body", status_code=400)

    message = envelope.get("message") if isinstance(envelope, dict) else None
    if not isinstance(message, dict) or not message.get("messageId"):
        return Response("Invalid Pub/Sub push envelope", status_code=400)

    # Optional allowlist: reject envelopes from a subscription we don't expect.
    allowed_subscription = os.environ.get("PUBSUB_SUBSCRIPTION")
    if allowed_subscription and envelope.get("subscription") != allowed_subscription:
        print("Rejected push from unexpected subscription:", envelope.get("subscription"))
        return Response("Untrusted subscription", status_code=403)

    attributes = message.get("attributes") or {}
    payload = decode_data(message.get("data"))

    # Delivery is at-least-once: de-duplicate on messageId, which is stable
    # across redeliveries of the same message.
    print("Pub/Sub message received:", message["messageId"])
    print("Published at:", message.get("publishTime"))
    # Your code: if already_processed(message["messageId"]): return Response(status_code=ACK_STATUS)

    # Pub/Sub defines no event catalog — any "event type" is whatever your
    # publisher put in `attributes`. Change the key to match your publisher.
    event_type = attributes.get("eventType")
    if event_type:
        print("Event type attribute:", event_type)
        # Your code: route on your publisher's own attribute values.
    elif payload is None:
        print("Attribute-only message (no data):", attributes)
    else:
        print("Payload:", payload)

    # Ack fast. The default ack deadline is 10s; do slow work asynchronously or
    # Pub/Sub redelivers the message.
    return Response(status_code=ACK_STATUS)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
