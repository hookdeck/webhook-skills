# Generated with: paypal-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import os
import zlib
from urllib.parse import urlparse

import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Cert cache — keyed by paypal-cert-url. PayPal rotates by changing the URL,
# so a cache miss == new cert == fetch once. Exposed for tests to preload.
cert_cache: dict[str, bytes] = {}


def fetch_cert(cert_url: str) -> bytes:
    """Fetch the PEM cert for a PayPal cert URL, with host allowlist + caching."""
    host = (urlparse(cert_url).hostname or "").lower()
    # SECURITY: only trust certs served from paypal.com hosts.
    if host != "paypal.com" and not host.endswith(".paypal.com"):
        raise ValueError(f"Untrusted cert URL host: {host}")

    cached = cert_cache.get(cert_url)
    if cached is not None:
        return cached

    response = httpx.get(cert_url, timeout=10)
    response.raise_for_status()
    pem = response.content
    cert_cache[cert_url] = pem
    return pem


def verify_paypal_webhook(headers, raw_body: bytes, webhook_id: str) -> bool:
    transmission_id = headers.get("paypal-transmission-id")
    transmission_time = headers.get("paypal-transmission-time")
    transmission_sig = headers.get("paypal-transmission-sig")
    cert_url = headers.get("paypal-cert-url")

    if not all([transmission_id, transmission_time, transmission_sig, cert_url]):
        return False

    # CRC-32 of the raw body as an UNSIGNED decimal integer.
    crc = zlib.crc32(raw_body) & 0xFFFFFFFF
    message = f"{transmission_id}|{transmission_time}|{webhook_id}|{crc}".encode()

    try:
        pem = fetch_cert(cert_url)
    except (ValueError, httpx.HTTPError):
        return False

    try:
        cert = x509.load_pem_x509_certificate(pem)
    except ValueError:
        return False

    try:
        cert.public_key().verify(
            base64.b64decode(transmission_sig),
            message,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


@app.post("/webhooks/paypal")
async def paypal_webhook(request: Request):
    webhook_id = os.environ.get("PAYPAL_WEBHOOK_ID")
    if not webhook_id:
        raise HTTPException(status_code=500, detail="Server misconfigured")

    # CRITICAL: read raw bytes — CRC-32 of the body is part of the signed message.
    raw_body = await request.body()

    if not verify_paypal_webhook(request.headers, raw_body, webhook_id):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event_type")
    resource = event.get("resource") or {}

    if event_type == "PAYMENT.CAPTURE.COMPLETED":
        print(f"Capture completed: {resource.get('id')}")
    elif event_type == "PAYMENT.CAPTURE.REFUNDED":
        print(f"Capture refunded: {resource.get('id')}")
    elif event_type == "PAYMENT.SALE.COMPLETED":
        print(f"Sale completed: {resource.get('id')}")
    elif event_type == "CHECKOUT.ORDER.APPROVED":
        print(f"Order approved: {resource.get('id')}")
    elif event_type == "BILLING.SUBSCRIPTION.CREATED":
        print(f"Subscription created: {resource.get('id')}")
    elif event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
        print(f"Subscription activated: {resource.get('id')}")
    elif event_type == "BILLING.SUBSCRIPTION.CANCELLED":
        print(f"Subscription cancelled: {resource.get('id')}")
    elif event_type == "CUSTOMER.DISPUTE.CREATED":
        print(f"Dispute opened: {resource.get('dispute_id')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
