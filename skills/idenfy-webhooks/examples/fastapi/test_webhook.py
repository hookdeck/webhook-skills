import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_idenfy_signing_key_0123456789"
os.environ["IDENFY_WEBHOOK_SECRET"] = SECRET

from main import app, verify_idenfy_signature  # noqa: E402

client = TestClient(app)


def sample_payload(**overrides):
    return {"scanRef": "scan-1", "clientId": "client-1", "final": True, "status": {"overall": "APPROVED"}, **overrides}


def sign(body: bytes, secret: str = SECRET) -> str:
    """Idenfy-Signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the signing key."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, signature=None, event_type="IDENTIFICATION_AUTO_FINISHED", content_type="application/json"):
    headers = {"Content-Type": content_type, "Idenfy-Event-Type": event_type}
    if signature is not None:
        headers["Idenfy-Signature"] = signature
    return client.post("/webhooks/idenfy", content=body, headers=headers)


def payload_bytes(**overrides) -> bytes:
    return json.dumps(sample_payload(**overrides)).encode()


class TestWebhookEndpoint:
    def test_accepts_valid_signature(self):
        body = payload_bytes()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        body = payload_bytes()
        assert post(body, sign(body).upper()).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = payload_bytes()
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    def test_verifies_exact_bytes_including_odd_whitespace(self):
        body = b'{ "scanRef" :   "scan-1" }\n'
        assert post(body, sign(body)).status_code == 200

    def test_rejects_wrong_secret(self):
        body = payload_bytes()
        assert post(body, sign(body, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(payload_bytes(scanRef="scan-2"), sign(payload_bytes())).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(payload_bytes()).status_code == 401

    def test_rejects_malformed_signatures(self):
        body = payload_bytes()
        good = sign(body)
        for bad in ["", "abc", good[:62], good + "00", "z" * 64, f"sha256={good}", good[:62] + "zz"]:
            assert post(body, bad).status_code == 401

    def test_non_ascii_signature_is_401_not_500(self):
        body = payload_bytes()
        res = client.post(
            "/webhooks/idenfy",
            content=body,
            headers={"Idenfy-Signature": "x" * 64, "Idenfy-Event-Type": "COMPANY_REVIEW"},
        )
        assert res.status_code == 401

    def test_invalid_json_returns_400_after_verification(self):
        assert post(b"not json", sign(b"not json")).status_code == 400

    def test_json_array_returns_400(self):
        assert post(b"[1,2]", sign(b"[1,2]")).status_code == 400

    @pytest.mark.parametrize(
        "event_type",
        [
            "IDENTIFICATION_AUTO_FINISHED",
            "IDENTIFICATION_MANUAL_FINISHED",
            "IDENTIFICATION_EXPIRED",
            "IDENTIFICATION_CANCELLED",
            "COMPANY_REVIEW",
            "AML_MONITORING",
            "FACIAL_AUTHENTICATION",
        ],
    )
    def test_returns_200_for_event(self, event_type):
        body = payload_bytes()
        assert post(body, sign(body), event_type).status_code == 200


class TestVerifyFunction:
    body = payload_bytes()

    def test_accepts_matching_signature(self):
        assert verify_idenfy_signature(self.body, sign(self.body), SECRET) is True

    def test_rejects_without_secret(self):
        assert verify_idenfy_signature(self.body, sign(self.body, ""), "") is False

    def test_rejects_non_string_and_non_ascii(self):
        assert verify_idenfy_signature(self.body, None, SECRET) is False
        assert verify_idenfy_signature(self.body, "é" * 64, SECRET) is False

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
