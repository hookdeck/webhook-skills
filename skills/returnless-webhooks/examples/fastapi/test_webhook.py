import hashlib
import hmac

import pytest
from fastapi.testclient import TestClient

from main import app, verify_returnless_webhook

SECRET = "test_signing_secret_abc123"

client = TestClient(app)

BODY = b'{"data":{"id":"return_12vM04vDdaQQJHxWprprL0IX","resource_type":"return"}}'


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("RETURNLESS_WEBHOOK_SECRET", SECRET)


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Returnless signs the raw body: HMAC-SHA256, lowercase hex, in X-Signature."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def post(payload: bytes, signature=None, event="return.created", content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Signature"] = signature
    if event:
        headers["X-Event-Name"] = event
    return client.post("/webhooks/returnless", content=payload, headers=headers)


class TestVerify:
    def test_valid_signature(self):
        assert verify_returnless_webhook(BODY, sign(BODY), SECRET)

    def test_uppercase_hex(self):
        assert verify_returnless_webhook(BODY, sign(BODY).upper(), SECRET)

    def test_wrong_secret(self):
        assert not verify_returnless_webhook(BODY, sign(BODY, "other"), SECRET)

    def test_missing_inputs(self):
        assert not verify_returnless_webhook(BODY, None, SECRET)
        assert not verify_returnless_webhook(BODY, "", SECRET)
        assert not verify_returnless_webhook(BODY, sign(BODY), "")

    def test_prefix_and_malformed(self):
        assert not verify_returnless_webhook(BODY, "sha256=" + sign(BODY), SECRET)
        assert not verify_returnless_webhook(BODY, sign(BODY)[:62], SECRET)
        assert not verify_returnless_webhook(BODY, "z" * 64, SECRET)


class TestEndpoint:
    def test_valid_signature(self):
        assert post(BODY, sign(BODY)).status_code == 200

    def test_uppercase_hex_signature(self):
        assert post(BODY, sign(BODY).upper()).status_code == 200

    @pytest.mark.parametrize(
        "event",
        [
            "request.created",
            "request.approved",
            "request.approved_with_manual_shipment",
            "request.approved_without_shipment",
            "request.rejected",
            "return.product.marked_as_received",
            "shipment.delivered",
            "return.notes.added",  # not specially handled: logged
        ],
    )
    def test_events(self, event):
        assert post(BODY, sign(BODY), event=event).status_code == 200

    def test_any_content_type(self):
        assert post(BODY, sign(BODY), content_type="text/plain").status_code == 200

    def test_whitespace_preserved(self):
        spaced = b'{ "data" :  { "id": "return_1" } }\n'
        assert post(spaced, sign(spaced)).status_code == 200

    def test_missing_signature(self):
        assert post(BODY).status_code == 401

    def test_empty_signature(self):
        assert post(BODY, "").status_code == 401

    def test_wrong_secret(self):
        assert post(BODY, sign(BODY, "other")).status_code == 401

    def test_tampered_body(self):
        assert post(BODY.replace(b"return_", b"retur_"), sign(BODY)).status_code == 401

    def test_prefixed_signature(self):
        assert post(BODY, "sha256=" + sign(BODY)).status_code == 401

    @pytest.mark.parametrize("bad", ["a" * 62, "z" * 64])
    def test_malformed_signature(self, bad):
        assert post(BODY, bad).status_code == 401

    def test_invalid_json(self):
        bad = b"not json"
        assert post(bad, sign(bad)).status_code == 400

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("RETURNLESS_WEBHOOK_SECRET")
        assert post(BODY, sign(BODY)).status_code == 500

    def test_health(self):
        assert client.get("/health").status_code == 200
