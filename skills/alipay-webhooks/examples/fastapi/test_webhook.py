import base64
import importlib
import json
import os
from urllib.parse import quote

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

CLIENT_ID = "SANDBOX_5YC47N2ZQHJ004124"
WEBHOOK_PATH = "/webhooks/alipay"

# An RSA key pair stands in for Antom (signs inbound notifications).
# SHA256withRSA is the algorithm the real provider uses.
_alipay_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _pem_public(key):
    return key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")


# Env must be set BEFORE importing the app (it reads env at module load).
os.environ["ALIPAY_CLIENT_ID"] = CLIENT_ID
os.environ["ALIPAY_PUBLIC_KEY"] = _pem_public(_alipay_key)

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

importlib.reload(main)
client = TestClient(main.app)


def sign_inbound(raw_body: str, client_id=CLIENT_ID, request_time="2026-07-24T10:00:00Z", url_encode=False):
    content = f"POST {WEBHOOK_PATH}\n{client_id}.{request_time}.{raw_body}".encode("utf-8")
    signature = _alipay_key.sign(content, padding.PKCS1v15(), hashes.SHA256())
    # Antom base64-encodes the signature and URL-encodes it on the wire.
    sig_b64url = base64.b64encode(signature).decode("utf-8")
    if url_encode:
        sig_b64url = quote(sig_b64url, safe="")
    return {
        "Client-Id": client_id,
        "Request-Time": request_time,
        "Signature": f"algorithm=RSA256,keyVersion=1,signature={sig_b64url}",
        "Content-Type": "application/json",
    }


def payment_payload(**overrides):
    payload = {
        "notifyType": "PAYMENT_RESULT",
        "result": {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "success"},
        "paymentRequestId": "pay_20260724_0001",
        "paymentId": "20260724194010800100188420201535803",
        "paymentAmount": {"value": "8000", "currency": "USD"},
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_missing_headers_returns_400():
    res = client.post(WEBHOOK_PATH, content=payment_payload(), headers={"Content-Type": "application/json"})
    assert res.status_code == 400


def test_invalid_signature_returns_401():
    payload = payment_payload()
    headers = sign_inbound(payload)
    headers["Signature"] = "algorithm=RSA256,keyVersion=1,signature=bm90LWEtc2ln"
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)
    assert res.status_code == 401


def test_tampered_body_returns_401():
    original = payment_payload(paymentAmount={"value": "8000", "currency": "USD"})
    headers = sign_inbound(original)
    tampered = payment_payload(paymentAmount={"value": "999999", "currency": "USD"})
    res = client.post(WEBHOOK_PATH, content=tampered, headers=headers)
    assert res.status_code == 401


def test_valid_signature_returns_fixed_ack():
    payload = payment_payload()
    headers = sign_inbound(payload)
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)

    assert res.status_code == 200
    assert res.json() == {
        "result": {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "success"}
    }
    assert res.headers.get("client-id") == CLIENT_ID
    assert res.headers.get("response-time")


def test_percent_encoded_signature_accepted():
    payload = payment_payload()
    headers = sign_inbound(payload, url_encode=True)
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)
    assert res.status_code == 200


import pytest  # noqa: E402


@pytest.mark.parametrize(
    "fields",
    [
        {"notifyType": "PAYMENT_RESULT", "paymentRequestId": "pay_1"},
        {"notifyType": "PAYMENT_PENDING", "paymentRequestId": "pay_1"},
        {"notifyType": "CAPTURE_RESULT", "captureRequestId": "cap_1", "captureId": "c_1"},
        {"notifyType": "REFUND_RESULT", "refundRequestId": "ref_1", "refundId": "r_1"},
        {"authorizationNotifyType": "AUTHCODE_CREATED", "authState": "state_1"},
        {"authorizationNotifyType": "TOKEN_CANCELED"},
        {"disputeNotificationType": "DISPUTE_CREATED", "disputeId": "dsp_1"},
        {"disputeNotificationType": "DISPUTE_JUDGED", "disputeId": "dsp_1"},
        {"notifyType": "SOMETHING_ELSE"},
    ],
)
def test_acknowledges_notification_types(fields):
    body = dict(fields)
    body["result"] = {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "success"}
    payload = json.dumps(body)
    headers = sign_inbound(payload)
    res = client.post(WEBHOOK_PATH, content=payload, headers=headers)
    assert res.status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
