import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_partner_api_key_0123456789"
os.environ["HINT_HEALTH_WEBHOOK_SECRET"] = SECRET

from main import app, verify_hint_signature  # noqa: E402

client = TestClient(app)

# Payload as shown in the Hint Health docs
PATIENT_CREATED = {
    "id": "evt-jKi2jlalOJk3",
    "created_at": "2015-02-19T10:49:21.419-08:00",
    "type": "patient.created",
    "practice_id": "pra-6BIBTelN3rM5",
    "object": {"id": "pat-eN9DgCQ9iQxL", "first_name": "Jane", "last_name": "Doe"},
}


def digest(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Hint Health: hex(HMAC-SHA256(raw_body, signature key))."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def sign(body: bytes, secret: str = SECRET) -> str:
    return f"sha256={digest(body, secret)}"


def post(body: bytes, signature: str | bytes | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Hint-Signature"] = signature
    return client.post("/webhooks/hint-health", content=body, headers=headers)


def payload(**overrides) -> bytes:
    return json.dumps({**PATIENT_CREATED, **overrides}).encode()


class TestVerifyHintSignature:
    body = payload()

    def test_accepts_prefixed_digest(self):
        assert verify_hint_signature(self.body, sign(self.body), SECRET)

    def test_accepts_bare_digest(self):
        assert verify_hint_signature(self.body, digest(self.body), SECRET)

    def test_accepts_uppercase_hex(self):
        assert verify_hint_signature(self.body, digest(self.body).upper(), SECRET)
        assert verify_hint_signature(self.body, f"sha256={digest(self.body).upper()}", SECRET)

    @pytest.mark.parametrize(
        "header",
        [
            "",
            "sha256=",
            "sha256=abcd",
            "sha256=" + "z" * 64,
            "sha1=" + "a" * 40,
            "é" * 64,
            "sha256=" + "a" * 64 + "\n",
        ],
    )
    def test_rejects_malformed_values_without_raising(self, header):
        assert not verify_hint_signature(self.body, header, SECRET)

    def test_rejects_wrong_or_missing_secret(self):
        assert not verify_hint_signature(self.body, sign(self.body, "other_key"), SECRET)
        assert not verify_hint_signature(self.body, sign(self.body), None)
        assert not verify_hint_signature(self.body, None, SECRET)


class TestWebhookEndpoint:
    def test_accepts_valid_signature_and_documented_payload(self):
        body = payload()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_bare_digest(self):
        body = payload()
        assert post(body, digest(body)).status_code == 200

    def test_verifies_exact_bytes_not_reserialized_body(self):
        body = json.dumps(PATIENT_CREATED, indent=4).encode()
        assert post(body, sign(body)).status_code == 200

    def test_verifies_any_content_type(self):
        body = payload()
        assert post(body, sign(body), "text/plain").status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        [
            "patient.updated",
            "patient.destroyed",
            "patient.inactive",
            "membership.created",
            "membership.updated",
            "membership.destroyed",
            "practitioner.created",
            "practitioner.updated",
            "practitioner.destroyed",
            "company.created",
        ],
    )
    def test_handles_event_types(self, event_type):
        body = payload(type=event_type)
        assert post(body, sign(body)).status_code == 200

    def test_missing_signature_returns_401(self):
        assert post(payload()).status_code == 401

    def test_empty_signature_returns_401(self):
        assert post(payload(), "").status_code == 401

    def test_malformed_signature_returns_401(self):
        body = payload()
        assert post(body, "sha256=nothex").status_code == 401
        assert post(body, "sha256=" + digest(body)[:62]).status_code == 401

    def test_non_ascii_signature_returns_401(self):
        # Sent as latin-1 bytes, the way a non-ASCII header arrives on the wire
        assert post(payload(), b"\xe9" * 64).status_code == 401

    def test_wrong_key_returns_401(self):
        body = payload()
        assert post(body, sign(body, "other_key")).status_code == 401

    def test_tampered_body_returns_401(self):
        signed = payload()
        tampered = payload(practice_id="pra-other")
        assert post(tampered, sign(signed)).status_code == 401

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    @pytest.mark.parametrize("body", [b"[]", b"null", b'"text"', b"42"])
    def test_signed_non_object_returns_400(self, body):
        assert post(body, sign(body)).status_code == 400

    @pytest.mark.parametrize(
        "data",
        [
            {"type": 123, "object": "x"},
            {"type": "patient.created", "object": "not an object"},
            {"type": "membership.updated", "object": [1, 2], "id": 5},
            {"type": ["patient.created"], "object": None},
            {},
        ],
    )
    def test_wrong_typed_fields_are_ignored(self, data):
        body = json.dumps(data).encode()
        assert post(body, sign(body)).status_code == 200
