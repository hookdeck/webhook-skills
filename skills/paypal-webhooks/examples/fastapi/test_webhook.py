import base64
import datetime
import os
import zlib

import pytest

os.environ["PAYPAL_WEBHOOK_ID"] = "WH-TEST-WEBHOOK-ID"

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient

import main


# Generate a self-signed X.509 cert + RSA private key for the whole suite.
# This is what the route's verify_paypal_webhook expects to load from cert_cache.
_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

_subject = _issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "paypal-test")])
_now = datetime.datetime.now(datetime.timezone.utc)
_CERT = (
    x509.CertificateBuilder()
    .subject_name(_subject)
    .issuer_name(_issuer)
    .public_key(_PRIVATE_KEY.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(_now - datetime.timedelta(minutes=1))
    .not_valid_after(_now + datetime.timedelta(days=1))
    .sign(_PRIVATE_KEY, hashes.SHA256())
)
_CERT_PEM = _CERT.public_bytes(serialization.Encoding.PEM)

TEST_CERT_URL = (
    "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-test-360caa42"
)


@pytest.fixture(autouse=True)
def preload_cert_cache():
    """Each test starts with the test cert installed under TEST_CERT_URL."""
    main.cert_cache.clear()
    main.cert_cache[TEST_CERT_URL] = _CERT_PEM
    yield
    main.cert_cache.clear()


@pytest.fixture
def client():
    return TestClient(main.app)


def sign_paypal_request(raw_body: bytes, *, webhook_id: str | None = None) -> dict[str, str]:
    webhook_id = webhook_id or os.environ["PAYPAL_WEBHOOK_ID"]
    transmission_id = "b9e98030-d9b3-11ea-8f4a-test"
    transmission_time = "2024-08-22T18:23:10Z"
    crc = zlib.crc32(raw_body) & 0xFFFFFFFF
    message = f"{transmission_id}|{transmission_time}|{webhook_id}|{crc}".encode()
    sig = _PRIVATE_KEY.sign(message, padding.PKCS1v15(), hashes.SHA256())
    return {
        "paypal-transmission-id": transmission_id,
        "paypal-transmission-time": transmission_time,
        "paypal-transmission-sig": base64.b64encode(sig).decode(),
        "paypal-cert-url": TEST_CERT_URL,
        "paypal-auth-algo": "SHA256withRSA",
        "content-type": "application/json",
    }


def test_missing_headers_returns_400(client):
    response = client.post(
        "/webhooks/paypal",
        content=b'{"event_type":"PAYMENT.CAPTURE.COMPLETED"}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400


def test_invalid_signature_returns_400(client):
    payload = b'{"id":"WH-evt-1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_1"}}'
    headers = sign_paypal_request(payload)
    headers["paypal-transmission-sig"] = base64.b64encode(b"garbage").decode()
    response = client.post("/webhooks/paypal", content=payload, headers=headers)
    assert response.status_code == 400


def test_untrusted_cert_url_returns_400(client):
    payload = b'{"id":"WH-evt-2","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_2"}}'
    headers = sign_paypal_request(payload)
    headers["paypal-cert-url"] = "https://attacker.example.com/cert"
    response = client.post("/webhooks/paypal", content=payload, headers=headers)
    assert response.status_code == 400


def test_tampered_body_returns_400(client):
    original = b'{"id":"WH-evt-3","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_3","amount":{"value":"10.00","currency_code":"USD"}}}'
    headers = sign_paypal_request(original)
    tampered = b'{"id":"WH-evt-3","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_3","amount":{"value":"999.00","currency_code":"USD"}}}'
    response = client.post("/webhooks/paypal", content=tampered, headers=headers)
    assert response.status_code == 400


def test_wrong_webhook_id_returns_400(client):
    payload = b'{"id":"WH-evt-4","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_4"}}'
    headers = sign_paypal_request(payload, webhook_id="WH-DIFFERENT-ID")
    response = client.post("/webhooks/paypal", content=payload, headers=headers)
    assert response.status_code == 400


def test_valid_signature_returns_200(client):
    payload = b'{"id":"WH-evt-5","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_5"}}'
    headers = sign_paypal_request(payload)
    response = client.post("/webhooks/paypal", content=payload, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"received": True}


@pytest.mark.parametrize(
    "event_type",
    [
        "PAYMENT.CAPTURE.COMPLETED",
        "PAYMENT.CAPTURE.REFUNDED",
        "PAYMENT.SALE.COMPLETED",
        "CHECKOUT.ORDER.APPROVED",
        "BILLING.SUBSCRIPTION.CREATED",
        "BILLING.SUBSCRIPTION.ACTIVATED",
        "BILLING.SUBSCRIPTION.CANCELLED",
        "CUSTOMER.DISPUTE.CREATED",
        "UNHANDLED.EVENT.TYPE",
    ],
)
def test_handles_each_event_type(client, event_type):
    payload = (
        b'{"id":"WH-evt-x","event_type":"' + event_type.encode()
        + b'","resource":{"id":"res_x","dispute_id":"dispute_x"}}'
    )
    headers = sign_paypal_request(payload)
    response = client.post("/webhooks/paypal", content=payload, headers=headers)
    assert response.status_code == 200


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
