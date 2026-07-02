# Generated with: recurly-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()


def verify_recurly_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify the `recurly-signature` header for a JSON webhook.

    Header format: "<timestamp>,<sig1>,<sig2>,..." where timestamp is Unix time
    in milliseconds and each sig is a hex HMAC-SHA256 signature. Multiple
    signatures appear during a 24h key rotation; valid if ANY matches.

    Signed message: f"{timestamp}." + raw_body, over the RAW, unparsed body.
    """
    if not signature_header or not secret:
        return False

    parts = signature_header.split(",")
    timestamp, signatures = parts[0], parts[1:]
    if not timestamp or not signatures:
        return False

    message = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()

    # Constant-time compare; accept if any signature matches.
    return any(hmac.compare_digest(expected, sig.strip()) for sig in signatures)


def verify_basic_auth(auth_header: str | None) -> bool:
    """Verify HTTP Basic Auth. Only enforced when credentials are configured."""
    user = os.environ.get("RECURLY_WEBHOOK_USER")
    password = os.environ.get("RECURLY_WEBHOOK_PASSWORD")
    if not user and not password:
        return True  # not configured -> skip
    if not auth_header or not auth_header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth_header[len("Basic "):]).decode("utf-8")
    except Exception:
        return False
    got_user, _, got_pass = decoded.partition(":")
    return hmac.compare_digest(got_user, user or "") and hmac.compare_digest(got_pass, password or "")


@app.post("/webhooks/recurly")
async def recurly_webhook(request: Request):
    # Read the RAW body first — the signature is computed over the exact bytes
    # Recurly sent, so never parse before verifying.
    raw_body = await request.body()

    # 1. Optional HTTP Basic Auth (defense in depth; required to secure XML endpoints)
    if not verify_basic_auth(request.headers.get("authorization")):
        return Response(content="Unauthorized", status_code=401)

    # 2. Verify the signature over the raw body
    signature = request.headers.get("recurly-signature")
    if not signature:
        return Response(content="Missing recurly-signature header", status_code=400)

    secret = os.environ.get("RECURLY_WEBHOOK_SECRET", "")
    if not verify_recurly_signature(raw_body, signature, secret):
        return Response(content="Invalid signature", status_code=400)

    # 3. Parse AFTER verification. Classic JSON notifications use the notification
    #    type as the single top-level key, wrapping the related objects.
    try:
        notification = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    notification_type = next(iter(notification), None)
    data = notification.get(notification_type, {}) if notification_type else {}
    subscription = data.get("subscription", {})
    transaction = data.get("transaction", {})

    # 4. Dispatch on the notification type
    if notification_type == "new_subscription_notification":
        print("New subscription:", subscription.get("uuid"))
        # TODO: provision access, send welcome email, etc.
    elif notification_type == "updated_subscription_notification":
        print("Subscription updated:", subscription.get("uuid"))
        # TODO: adjust entitlements for the new plan/quantity, etc.
    elif notification_type == "canceled_subscription_notification":
        print("Subscription canceled:", subscription.get("uuid"))
        # TODO: schedule access removal at term end, send retention email, etc.
    elif notification_type == "expired_subscription_notification":
        print("Subscription expired:", subscription.get("uuid"))
        # TODO: revoke access, etc.
    elif notification_type == "renewed_subscription_notification":
        print("Subscription renewed:", subscription.get("uuid"))
        # TODO: extend access for the new term, etc.
    elif notification_type == "successful_payment_notification":
        print("Payment succeeded:", transaction.get("uuid"))
        # TODO: record payment, send receipt, etc.
    elif notification_type == "failed_payment_notification":
        print("Payment failed:", transaction.get("uuid"))
        # TODO: notify customer, trigger dunning, etc.
    else:
        print(f"Unhandled notification type: {notification_type}")

    # Optional: confirm state with the Recurly API before acting on it. Webhooks
    # can arrive out of order, so fetch the object to read its current state:
    #
    #   import recurly
    #   client = recurly.Client(os.environ["RECURLY_API_KEY"])
    #   sub = client.get_subscription("uuid-" + subscription["uuid"])

    # Acknowledge receipt quickly; do heavy work asynchronously.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
