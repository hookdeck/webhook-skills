import os
import hmac
import hashlib
import base64
import json

import pytest
from fastapi.testclient import TestClient

SECRET = "test_rutter_client_secret"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("RUTTER_CLIENT_SECRET", SECRET)
    monkeypatch.delenv("RUTTER_CLIENT_SECRET_PREVIOUS", raising=False)


from main import app, verify_rutter_webhook  # noqa: E402

client = TestClient(app)


def generate_rutter_signature(payload: bytes, secret: str) -> str:
    """Rutter signature: "sha256=" + base64(HMAC-SHA256(payload, secret))."""
    digest = hmac.new(secret.encode(), payload, hashlib.sha256).digest()
    return "sha256=" + base64.b64encode(digest).decode()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/rutter",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


class TestVerifyRutterWebhook:
    payload = b'{"type":"CONNECTION","code":"INITIAL_UPDATE"}'

    def test_valid_signature(self):
        sig = generate_rutter_signature(self.payload, SECRET)
        assert verify_rutter_webhook(self.payload, sig, [SECRET]) is True

    def test_invalid_signature(self):
        assert verify_rutter_webhook(self.payload, "sha256=invalid", [SECRET]) is False

    def test_missing_header(self):
        assert verify_rutter_webhook(self.payload, None, [SECRET]) is False

    def test_wrong_secret(self):
        sig = generate_rutter_signature(self.payload, "other")
        assert verify_rutter_webhook(self.payload, sig, [SECRET]) is False

    def test_modified_payload(self):
        sig = generate_rutter_signature(self.payload, SECRET)
        assert verify_rutter_webhook(b'{"tampered":true}', sig, [SECRET]) is False

    def test_any_entry_in_list_matches_during_rotation(self):
        lst = ", ".join([
            generate_rutter_signature(self.payload, "new_secret"),
            generate_rutter_signature(self.payload, "expiring_secret"),
        ])
        assert verify_rutter_webhook(self.payload, lst, ["expiring_secret"]) is True
        assert verify_rutter_webhook(self.payload, lst, ["new_secret"]) is True
        assert verify_rutter_webhook(self.payload, lst, ["unrelated"]) is False

    def test_no_space_after_comma(self):
        lst = ",".join([
            generate_rutter_signature(self.payload, "new_secret"),
            generate_rutter_signature(self.payload, SECRET),
        ])
        assert verify_rutter_webhook(self.payload, lst, [SECRET]) is True

    def test_empty_secret_ignored(self):
        sig = generate_rutter_signature(self.payload, "")
        assert verify_rutter_webhook(self.payload, sig, [""]) is False


class TestRutterWebhookEndpoint:
    payload = json.dumps({
        "type": "CONNECTION",
        "code": "INITIAL_UPDATE",
        "connection_id": "3adc1519-0d6e-4222-83de-25b457cf42be",
        "access_token": "313c3e00-2bbc-4b2e-a9dc-13abed546b65",
    }).encode()

    def test_missing_signature_returns_400(self):
        assert post(self.payload).status_code == 400

    def test_invalid_signature_returns_400(self):
        res = post(self.payload, {"X-Rutter-Signatures": "sha256=bad"})
        assert res.status_code == 400

    def test_valid_signatures_header_returns_200(self):
        sig = generate_rutter_signature(self.payload, SECRET)
        res = post(self.payload, {"X-Rutter-Signature": sig, "X-Rutter-Signatures": sig})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_falls_back_to_single_signature_header(self):
        sig = generate_rutter_signature(self.payload, SECRET)
        assert post(self.payload, {"X-Rutter-Signature": sig}).status_code == 200

    def test_rotation_with_previous_secret(self, monkeypatch):
        monkeypatch.setenv("RUTTER_CLIENT_SECRET_PREVIOUS", "expiring_secret")
        lst = ", ".join([
            generate_rutter_signature(self.payload, "brand_new_secret"),
            generate_rutter_signature(self.payload, "expiring_secret"),
        ])
        assert post(self.payload, {"X-Rutter-Signatures": lst}).status_code == 200

    @pytest.mark.parametrize("event", [
        {"type": "CONNECTION", "code": "CONNECTION_NEEDS_UPDATE", "update_url": "https://link.rutterapi.com/connection/x"},
        {"type": "CONNECTION", "code": "CONNECTION_DISABLED", "disable_error": "e", "disable_message": "m"},
        {"type": "ORDER", "code": "ORDER_CREATED", "order": {"id": "o1"}},
        {"type": "ORDER", "code": "ORDER_UPDATED", "order": {"id": "o1"}},
        {"type": "ORDER", "code": "ORDER_DELETED", "order": {"id": "o1"}},
        {"type": "INVOICE", "code": "INVOICE_CREATED", "invoice": {"id": "i1"}},
        {"type": "INVOICE", "code": "INVOICE_UPDATED", "invoice": {"id": "i1"}},
        {"type": "VENDOR", "code": "VENDOR_CREATED", "vendor": {"id": "v1"}},  # unhandled but acknowledged
    ])
    def test_acknowledges_events(self, event):
        body = json.dumps({**event, "connection_id": "c1", "access_token": "t1"}).encode()
        sig = generate_rutter_signature(body, SECRET)
        assert post(body, {"X-Rutter-Signatures": sig}).status_code == 200

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        sig = generate_rutter_signature(body, SECRET)
        assert post(body, {"X-Rutter-Signatures": sig}).status_code == 400
