import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Any string works: the signing secret is used as-is as UTF-8 key bytes. Test value only.
SECRET = "test_kolide_signing_secret"
os.environ["KOLIDE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

# Bodies follow the sample payloads in Kolide's docs.
DEVICE_CREATED = {
    "event": "devices.created",
    "id": "01HDVY8MA3CQ48HJ356FP8M2P6",
    "timestamp": "2023-10-28T20:05:33Z",
    "data": {"device_id": 1, "device_name": "Jasons-MacBook-Pro"},
}
ISSUE_NEW = {
    "event": "issues.new",
    "id": "01HDW0TFR12Q0DJFVY7Y0DBQ0N",
    "timestamp": "2023-10-28T20:50:15Z",
    "data": {
        "issue_id": 2,
        "title": None,
        "check_id": 71,
        "device": {"id": 1, "name": "Jasons-MacBook-Pro-2"},
        "check": {"id": 71, "name": "macOS Firewall - Require macOS Firewall is Enabled", "tags": []},
    },
}
STATUS_CHANGED = {
    "event": "device_trust.status_changed",
    "id": "01J7EXHMF0FCA14EW04JASYCRP",
    "timestamp": "2024-09-10T21:30:59Z",
    "data": {
        "device_id": 9,
        "device_name": "Matts-Kolide-MacBook-Pro",
        "device_status": "blocked",
        "device_url": "https://api.kolide.com/devices/9",
    },
}
TEST_EVENT = {
    "event": "webhook.test",
    "id": "01HDVY6MBEYST7797YFFH6QK7C",
    "timestamp": "2023-10-28T20:04:28Z",
    "data": {"message": "This is a test webhook event"},
}


def sign(body: bytes, secret=SECRET) -> str:
    """The Authorization header is the bare lowercase hex digest of the raw body."""
    key = secret.encode() if isinstance(secret, str) else secret
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def post(body: bytes, authorization=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if authorization is not None:
        headers["authorization"] = authorization
    return client.post("/webhooks/kolide", content=body, headers=headers)


def as_bytes(payload) -> bytes:
    return json.dumps(payload).encode()


class TestSignatureVerification:
    def test_accepts_valid_bare_hex_authorization(self):
        body = as_bytes(DEVICE_CREATED)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        body = as_bytes(DEVICE_CREATED)
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_verifies_exact_bytes_not_reserialized_json(self):
        body = b'{ "event" : "webhook.test",\n  "id": "x", "data": {} }'
        assert post(body, sign(body)).status_code == 200
        assert post(body, sign(json.dumps(json.loads(body)).encode())).status_code == 401

    def test_accepts_uppercase_hex(self):
        body = as_bytes(TEST_EVENT)
        assert post(body, sign(body).upper()).status_code == 200

    def test_uses_secret_as_utf8_bytes_not_decoded(self, monkeypatch):
        body = as_bytes(TEST_EVENT)
        hex_secret = "00112233445566778899aabbccddeeff"
        monkeypatch.setenv("KOLIDE_WEBHOOK_SECRET", hex_secret)
        assert post(body, sign(body, hex_secret)).status_code == 200
        assert post(body, sign(body, bytes.fromhex(hex_secret))).status_code == 401

    def test_rejects_missing_authorization(self):
        assert post(as_bytes(TEST_EVENT)).status_code == 401

    def test_rejects_empty_authorization(self):
        assert post(as_bytes(TEST_EVENT), "").status_code == 401

    def test_rejects_bearer_prefix(self):
        body = as_bytes(TEST_EVENT)
        assert post(body, f"Bearer {sign(body)}").status_code == 401

    def test_rejects_wrong_secret(self):
        body = as_bytes(TEST_EVENT)
        assert post(body, sign(body, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        body = as_bytes(DEVICE_CREATED)
        tampered = as_bytes({**DEVICE_CREATED, "data": {"device_id": 2}})
        assert post(tampered, sign(body)).status_code == 401

    def test_rejects_malformed_hex(self):
        body = as_bytes(TEST_EVENT)
        good = sign(body)
        assert post(body, good[:63]).status_code == 401  # too short
        assert post(body, good + "00").status_code == 401  # too long
        assert post(body, good[:62] + "zz").status_code == 401  # bad alphabet

    def test_non_ascii_header_is_rejected_not_a_500(self):
        # Raw header bytes: httpx would refuse a non-ASCII str, so go through the app directly
        from main import verify_kolide

        assert verify_kolide(b"{}", "é" * 64, SECRET) is False
        assert verify_kolide(b"{}", "٠" * 64, SECRET) is False  # Arabic-indic digits are not [0-9]

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("KOLIDE_WEBHOOK_SECRET", raising=False)
        body = as_bytes(TEST_EVENT)
        assert post(body, sign(body)).status_code == 500


class TestEventHandling:
    def send(self, payload):
        body = as_bytes(payload)
        return post(body, sign(body))

    @pytest.mark.parametrize(
        "payload,expected",
        [
            (DEVICE_CREATED, "Device created: Jasons-MacBook-Pro (id 1)"),
            (ISSUE_NEW, "issues.new: macOS Firewall - Require macOS Firewall is Enabled on Jasons-MacBook-Pro-2"),
            (STATUS_CHANGED, "Device Matts-Kolide-MacBook-Pro is now blocked"),
            (TEST_EVENT, "Test webhook received"),
        ],
    )
    def test_handles_event(self, payload, expected, capsys):
        assert self.send(payload).status_code == 200
        assert expected in capsys.readouterr().out

    def test_logs_unhandled_documented_event(self, capsys):
        res = self.send({"event": "admin_users.created", "id": "x", "data": {"user_id": 1}})
        assert res.status_code == 200
        assert "Unhandled event: admin_users.created" in capsys.readouterr().out

    def test_ignores_wrong_typed_nested_fields(self):
        assert self.send({"event": "issues.new", "id": "x", "data": {"device": "nope", "check": [1]}}).status_code == 200
        assert self.send({"event": "devices.registered", "id": "x", "data": "not an object"}).status_code == 200
        assert self.send({"event": "devices.created", "id": "x", "data": {"device_name": {"a": 1}}}).status_code == 200

    @pytest.mark.parametrize(
        "body",
        [b"not json", b"[]", b"null", b'"str"', b'{"event": 5}', b'{"id": "x"}', b"\xff\xfe"],
    )
    def test_400_for_signed_body_that_is_not_an_event_object(self, body):
        assert post(body, sign(body)).status_code == 400
