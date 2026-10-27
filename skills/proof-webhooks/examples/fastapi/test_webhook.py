import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

from main import app, verify_proof_signature

client = TestClient(app)

SECRET = "test_proof_api_key"


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("PROOF_WEBHOOK_SECRET", SECRET)


def sign(body: str | bytes, key: str = SECRET) -> str:
    """Proof: bare lowercase hex HMAC-SHA256 of the raw body bytes."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    return hmac.new(key.encode("utf-8"), raw, hashlib.sha256).hexdigest()


def post(body: str, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Notarize-Signature"] = signature
    return client.post("/webhooks/proof", content=body, headers=headers)


# Payload shapes as shown in Proof's Webhooks V2 docs
PAYLOADS = {
    "declined": {"event": "transaction.declined", "data": {"transaction_id": "ot_XXXXXX", "date_occurred": "2025-08-12T17:56:35Z"}},
    "held_for_review": {"event": "transaction.held_for_review", "data": {"transaction_id": "ot_XXXXXX", "date_occurred": "2025-08-12T17:56:35Z"}},
    "created": {"event": "transaction.created", "data": {"transaction_id": "ot_XXXXXX", "date_occurred": "2025-08-12T17:56:35Z"}},
    "completed": {"event": "transaction.completed", "data": {"transaction_id": "ot_XXXXXX", "date_occurred": "2025-08-12T17:56:35Z"}},
    "released": {"event": "transaction.released", "data": {"transaction_id": "ot_XXXXXX", "date_occurred": "2025-08-12T17:56:35Z"}},
    "notary_created": {"event": "notary.created", "data": {"notary_id": "on_XXXXXX", "date_occurred": "2025-08-12T17:56:35Z"}},
    "import_processed": {
        "event": "transaction.import.processed",
        "data": {
            "date_occurred": "2025-08-12T17:56:35Z",
            "transaction_id": "ot_XXXXXX",
            "documents": [{"document_id": "do_XXXXXX", "name": "test.pdf", "processing_error": None, "processing_state": "done"}],
            "documents_count": 1,
        },
    },
}

BODY = json.dumps(PAYLOADS["created"])


class TestWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        assert post(BODY).status_code == 401

    def test_empty_signature_returns_401(self):
        assert post(BODY, "").status_code == 401

    def test_malformed_signature_returns_401(self):
        assert post(BODY, "invalid").status_code == 401

    def test_non_hex_signature_returns_401(self):
        assert post(BODY, "z" * 64).status_code == 401

    def test_prefixed_signature_returns_401(self):
        assert post(BODY, f"sha256={sign(BODY)}").status_code == 401

    def test_wrong_key_returns_401(self):
        assert post(BODY, sign(BODY, "other_key")).status_code == 401

    def test_altered_body_returns_401(self):
        assert post(json.dumps(PAYLOADS["completed"]), sign(BODY)).status_code == 401

    def test_reserialized_body_returns_401(self):
        pretty = json.dumps(PAYLOADS["created"], indent=2)
        assert post(pretty, sign(BODY)).status_code == 401

    def test_unconfigured_secret_returns_401(self, monkeypatch):
        monkeypatch.delenv("PROOF_WEBHOOK_SECRET")
        assert post(BODY, sign(BODY)).status_code == 401

    def test_valid_signature_returns_200(self):
        res = post(BODY, sign(BODY))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_uppercase_hex_signature_returns_200(self):
        assert post(BODY, sign(BODY).upper()).status_code == 200

    def test_any_content_type_is_verified_on_raw_bytes(self):
        assert post(BODY, sign(BODY), "text/plain").status_code == 200

    def test_signed_non_json_returns_400(self):
        bad = "not json"
        assert post(bad, sign(bad)).status_code == 400

    @pytest.mark.parametrize("name", list(PAYLOADS))
    def test_handles_documented_payloads(self, name):
        raw = json.dumps(PAYLOADS[name])
        assert post(raw, sign(raw)).status_code == 200

    def test_unhandled_event_returns_200(self, capsys):
        raw = json.dumps({"event": "transaction.meeting.created", "data": {"transaction_id": "ot_XXXXXX"}})
        assert post(raw, sign(raw)).status_code == 200
        assert "Unhandled event: transaction.meeting.created" in capsys.readouterr().out


class TestVerifyProofSignature:
    RAW = BODY.encode()

    def test_accepts_correct_digest(self):
        assert verify_proof_signature(self.RAW, sign(BODY), SECRET) is True

    def test_rejects_wrong_length_and_missing(self):
        assert verify_proof_signature(self.RAW, sign(BODY)[2:], SECRET) is False
        assert verify_proof_signature(self.RAW, None, SECRET) is False
        assert verify_proof_signature(self.RAW, sign(BODY), "") is False

    def test_rejects_trailing_newline(self):
        assert verify_proof_signature(self.RAW, sign(BODY) + "\n", SECRET) is False
