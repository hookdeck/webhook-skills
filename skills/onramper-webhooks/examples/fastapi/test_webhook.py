import hashlib
import hmac
import json
import os

import pytest

# Onramper issues an arbitrary secret string; it is used as-is as UTF-8 bytes.
SECRET = "test_onramper_webhook_secret"
os.environ["ONRAMPER_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient

from main import app, verify_onramper_signature

client = TestClient(app)

# Payload from Onramper's documented sample
PENDING = {
    "apiKey": "pk_test_01K4MF4ZBPGDCV3GFFNA684NT0",
    "country": "us",
    "inAmount": 100,
    "onramp": "gatefi",
    "onrampTransactionId": "8bf94c80-test-aabb-851-143835984d1d",
    "outAmount": 3.83527521,
    "paymentMethod": "creditcard",
    "partnerContext": "",
    "sourceCurrency": "usd",
    "status": "pending",
    "statusDate": "2023-08-09T13:15:18.725Z",
    "targetCurrency": "sol",
    "transactionId": "01H7D547TESTV2RQJ52ZAB7WF7",
    "transactionType": "buy",
    "transactionHash": "",
    "walletAddress": "testG15oy66q7cU6aNige54PxLLEfGZvRsAADjbF7D4",
}


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body, signature=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-onramper-webhook-signature"] = signature
    return client.post("/webhooks/onramper", content=body, headers=headers)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        body = json.dumps(PENDING).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex(self):
        body = json.dumps(PENDING).encode()
        assert post(body, sign(body).upper()).status_code == 200

    def test_verifies_exact_bytes(self):
        body = json.dumps(PENDING, indent=2).encode()
        assert post(body, sign(body)).status_code == 200

    def test_accepts_any_content_type(self):
        body = json.dumps(PENDING).encode()
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    def test_rejects_missing_signature(self):
        assert post(json.dumps(PENDING).encode()).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(json.dumps(PENDING).encode(), "").status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(PENDING).encode()
        assert post(body, sign(body, "other_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(PENDING).encode()
        tampered = body.replace(b'"inAmount": 100', b'"inAmount": 1')
        assert tampered != body
        assert post(tampered, sign(body)).status_code == 401

    def test_rejects_malformed_signatures(self):
        body = json.dumps(PENDING).encode()
        good = sign(body)
        for bad in [good[:62], good + "00", good[:63] + "z", "sha256=" + good, "g" * 64]:
            assert post(body, bad).status_code == 401

    def test_rejects_when_secret_not_configured(self, monkeypatch):
        body = json.dumps(PENDING).encode()
        monkeypatch.delenv("ONRAMPER_WEBHOOK_SECRET")
        assert post(body, sign(body)).status_code == 401


class TestStatusEvents:
    @pytest.mark.parametrize("status", ["completed", "paid", "pending", "new", "failed", "canceled"])
    def test_handles_status(self, status, capsys):
        body = json.dumps({**PENDING, "status": status}).encode()
        assert post(body, sign(body)).status_code == 200
        assert PENDING["transactionId"] in capsys.readouterr().out

    def test_handles_offramp(self, capsys):
        body = json.dumps({**PENDING, "status": "completed", "transactionType": "offramp"}).encode()
        assert post(body, sign(body)).status_code == 200
        assert "(offramp)" in capsys.readouterr().out

    def test_logs_unknown_status(self, capsys):
        body = json.dumps({**PENDING, "status": "something_else"}).encode()
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled status" in capsys.readouterr().out


def test_signed_invalid_json_returns_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400


def test_signed_non_object_json_returns_400():
    body = b"[1, 2]"
    assert post(body, sign(body)).status_code == 400


def test_verify_function_on_bytes():
    body = b'{"status":"new"}'
    assert verify_onramper_signature(body, sign(body), SECRET) is True
    assert verify_onramper_signature(body, sign(body), "nope") is False


def test_health():
    assert client.get("/health").status_code == 200
