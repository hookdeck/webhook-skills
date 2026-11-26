# Generated with: aws-sns-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""AWS SNS webhook handler for FastAPI.

There is no AWS webhook-verification SDK for Python, so signatures are verified
manually against AWS's public X.509 certificate using the `cryptography`
library. The canonical string and field selection follow AWS's signature docs
and the AWS-official `sns-validator` (Node) 0.3.6, so this handler stays
consistent with the Express and Next.js examples.
"""
import base64
import json
import os
import re
from urllib.parse import urlparse

import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

# Only fetch signing certs from AWS SNS hosts (never an attacker-supplied URL).
_CERT_HOST = re.compile(r"^sns\.[a-zA-Z0-9\-]{3,}\.amazonaws\.com(\.cn)?$")

# Fixed key order per type; include a key only if present in the message.
# Both confirmation types sign SubscribeURL and Token; a Notification signs Subject if present.
_NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
_CONFIRMATION_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]

# Cache fetched certificates by URL.
_cert_cache: dict[str, bytes] = {}


def fetch_certificate(url: str) -> bytes:
    """Download the signing certificate (cached). Isolated so tests can patch it."""
    if url not in _cert_cache:
        _cert_cache[url] = httpx.get(url, timeout=5).content
    return _cert_cache[url]


def confirm_subscription(subscribe_url: str) -> None:
    """Confirm an HTTP/S subscription by visiting SubscribeURL."""
    response = httpx.get(subscribe_url, timeout=5)
    response.raise_for_status()


def canonical_string(message: dict) -> bytes:
    """Build the SNS "Key\\nValue\\n" string to sign, in byte-sorted key order."""
    keys = _NOTIFICATION_KEYS if message.get("Type") == "Notification" else _CONFIRMATION_KEYS
    parts: list[str] = []
    for field in keys:
        value = message.get(field)
        if value is None:
            continue  # Subject is included only when present
        parts.append(field)
        parts.append(str(value))
    return ("\n".join(parts) + "\n").encode("utf-8")


def verify_signature(message: dict) -> bool:
    """RSA-verify the base64 Signature against the cert from SigningCertURL."""
    cert_url = message.get("SigningCertURL", "")
    parsed = urlparse(cert_url)
    if parsed.scheme != "https" or not _CERT_HOST.match(parsed.hostname or ""):
        return False  # untrusted certificate host

    try:
        cert_pem = fetch_certificate(cert_url)
        public_key = x509.load_pem_x509_certificate(cert_pem).public_key()
        # SignatureVersion 1 = SHA1 (default), 2 = SHA256.
        algorithm = hashes.SHA256() if message.get("SignatureVersion") == "2" else hashes.SHA1()
        public_key.verify(
            base64.b64decode(message["Signature"]),
            canonical_string(message),
            padding.PKCS1v15(),
            algorithm,
        )
        return True
    except (InvalidSignature, KeyError, ValueError):
        return False


@app.post("/webhooks/aws-sns")
async def sns_webhook(request: Request):
    # x-amz-sns-message-type lets us branch without parsing the body first.
    message_type = request.headers.get("x-amz-sns-message-type")
    if not message_type:
        return Response("Missing x-amz-sns-message-type header", status_code=400)

    # SNS signs specific envelope fields; parse the raw body, then verify.
    raw_body = await request.body()
    try:
        message = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response("Invalid JSON body", status_code=400)

    # Verify authenticity before doing anything else.
    if not verify_signature(message):
        return Response("Invalid signature", status_code=400)

    # Optionally reject topics we don't expect (there is no shared secret).
    allowed_topic_arn = os.environ.get("AWS_SNS_TOPIC_ARN")
    if allowed_topic_arn and message.get("TopicArn") != allowed_topic_arn:
        return Response("Untrusted topic", status_code=403)

    if message_type == "SubscriptionConfirmation":
        # Confirm the subscription, or SNS never delivers notifications.
        try:
            confirm_subscription(message["SubscribeURL"])
            print("Subscription confirmed for topic:", message.get("TopicArn"))
        except Exception as exc:  # noqa: BLE001
            print("Failed to confirm subscription:", exc)
            return Response("Failed to confirm subscription", status_code=500)

    elif message_type == "Notification":
        # De-duplicate on MessageId — SNS retries can redeliver.
        print("Notification received:", message.get("MessageId"))
        print("Subject:", message.get("Subject"))
        print("Message:", message.get("Message"))
        # Your code: process the notification (Message is often JSON).

    elif message_type == "UnsubscribeConfirmation":
        # The endpoint was unsubscribed. Re-subscribe here if unexpected.
        print("Unsubscribe confirmation for topic:", message.get("TopicArn"))

    else:
        print("Unhandled SNS message type:", message_type)

    # Respond 2xx within ~15s or SNS treats delivery as failed and retries.
    return Response("OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
