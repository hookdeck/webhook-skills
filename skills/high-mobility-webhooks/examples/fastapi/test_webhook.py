import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

# High Mobility secrets are plain strings used as UTF-8 bytes; this one is only for tests
SECRET = "test_secret_for_high_mobility"
os.environ["HIGH_MOBILITY_WEBHOOK_SECRET"] = SECRET

from main import app, verify_high_mobility  # noqa: E402

client = TestClient(app)
URL = "/webhooks/high-mobility"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("HIGH_MOBILITY_WEBHOOK_SECRET", SECRET)


def digest(body, secret: str = SECRET) -> str:
    if isinstance(body, str):
        body = body.encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def sign(body, secret: str = SECRET) -> str:
    return f"sha256={digest(body, secret)}"


# Payload as shown in High Mobility's docs
CLEARANCE = {
    "vehicle": {"vin": "1HMCF6112HA3FBBCC"},
    "event": {
        "type": "fleet_clearance_changed",
        "action": "rejected",
        "detail": "invalid VIN",
        "received_at": "2025-06-19T09:49:08.386159Z",
    },
    "application": {"id": "A77294AC8DA324FB46DA98921"},
}
PING = {
    "vehicle": {"vin": "*"},
    "event": {"type": "ping", "received_at": "2025-06-19T09:49:08.386159Z"},
    "application": {"id": "A77294AC8DA324FB46DA98921"},
}


def send(method, body=None, signature=None, content_type="application/json"):
    headers = {}
    if signature is not None:
        headers["x-hm-signature-256"] = signature
    if body is not None:
        headers["Content-Type"] = content_type
    return client.request(method, URL, content=body, headers=headers)


def post(payload):
    body = payload if isinstance(payload, str) else json.dumps(payload)
    return send("POST", body, sign(body))


class TestSignatureVerification:
    body = json.dumps(CLEARANCE)

    def test_accepts_prefixed_digest(self):
        res = send("POST", self.body, sign(self.body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_bare_and_uppercase_digest(self):
        assert send("POST", self.body, digest(self.body)).status_code == 200
        assert send("POST", self.body, f"sha256={digest(self.body).upper()}").status_code == 200

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_verifies_each_method(self, method):
        assert send(method, self.body, sign(self.body)).status_code == 200
        assert send(method, self.body, sign(self.body, "wrong")).status_code == 401

    def test_get_without_body_is_verified_over_zero_bytes(self):
        res = send("GET", None, sign(b""))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert send("GET", None, sign("x")).status_code == 401
        assert send("GET").status_code == 401

    def test_verifies_exact_bytes_for_any_content_type(self):
        text = json.dumps(CLEARANCE, indent=4)  # formatting must not matter
        assert send("POST", text, sign(text), "text/plain").status_code == 200

    def test_verifies_non_utf8_bytes_then_rejects_json(self):
        data = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        res = send("POST", data, sign(data), "application/octet-stream")
        assert res.status_code == 400

    @pytest.mark.parametrize(
        "header",
        [
            "",
            "sha256=",
            "sha256=abc123",
            "sha256=" + "z" * 64,
            "sha256=" + digest(body) + "00",
            "sha1=" + digest(body),
            ("sha256=é" + digest(body)[1:]).encode("latin-1"),  # non-ASCII header bytes
        ],
    )
    def test_rejects_malformed_signature(self, header):
        assert send("POST", self.body, header).status_code == 401

    def test_rejects_missing_signature(self):
        assert send("POST", self.body).status_code == 401

    def test_rejects_wrong_secret_and_tampered_body(self):
        assert send("POST", self.body, sign(self.body, "wrong_secret")).status_code == 401
        assert send("POST", self.body + " ", sign(self.body)).status_code == 401

    def test_ignores_deprecated_sha1_header(self):
        sha1 = hmac.new(SECRET.encode(), self.body.encode(), hashlib.sha1).hexdigest()
        res = client.post(
            URL,
            content=self.body,
            headers={"Content-Type": "application/json", "X-HM-Signature": sha1},
        )
        assert res.status_code == 401

    def test_returns_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("HIGH_MOBILITY_WEBHOOK_SECRET")
        assert send("POST", self.body, sign(self.body)).status_code == 500


class TestEventHandling:
    def test_fleet_clearance_changed(self, caplog):
        with caplog.at_level(logging.INFO, logger="high-mobility-webhooks"):
            assert post(CLEARANCE).status_code == 200
        assert "Fleet clearance changed for 1HMCF6112HA3FBBCC: rejected invalid VIN" in caplog.text

    def test_ping(self):
        assert post(PING).status_code == 200

    def test_unknown_event_is_acknowledged(self, caplog):
        with caplog.at_level(logging.INFO, logger="high-mobility-webhooks"):
            assert post({"event": {"type": "something_else"}}).status_code == 200
        assert "Unhandled event: something_else" in caplog.text

    @pytest.mark.parametrize("bad", ["not json", "[]", '"text"', "null", "42"])
    def test_invalid_json_or_non_object_is_400(self, bad):
        assert post(bad).status_code == 400

    @pytest.mark.parametrize(
        "payload",
        [
            {"event": "fleet_clearance_changed"},
            {"event": ["x"], "vehicle": "vin"},
            {"event": {"type": 5, "action": {}, "detail": []}, "vehicle": {"vin": 7}},
            {"event": {"type": "fleet_clearance_changed"}, "vehicle": None},
            {},
        ],
    )
    def test_wrong_typed_fields_are_ignored(self, payload):
        assert post(payload).status_code == 200


def test_verify_requires_secret_and_header():
    assert verify_high_mobility(b"x", sign("x"), "") is False
    assert verify_high_mobility(b"x", "", SECRET) is False
