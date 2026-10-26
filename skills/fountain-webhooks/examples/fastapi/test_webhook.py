import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
os.environ["FOUNTAIN_WEBHOOK_SECRET"] = "test_fountain_private_api_token_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, classify, verify_fountain_signature

client = TestClient(app)

SECRET = os.environ["FOUNTAIN_WEBHOOK_SECRET"]

# Sample payloads based on the applicant and worker examples in the Fountain docs.
APPLICANT = {
    "applicant": {
        "email": "example@example.com",
        "name": "Logan Paucek",
        "id": "c780d083-6e73-4810-85a9-17e72d5b7a93",
        "background_checks": [{"id": "bc-1", "status": "pending"}],
        "funnel": {"title": "Fountain applicants", "id": "05e515a8-fe15-4f11-a1a7-98e0aabb0cd6"},
        "stage": {"title": "Approved", "id": "e2921e5b-ae20-4c56-9dc8-bb6209e021b7"},
        "document_signatures": [],
    }
}

WORKER = {
    "is_active": True,
    "name": "Ms. Isaiah Bernier",
    "email": "dariana_stiedemann@streichfadel.co",
    "id": "70bbb9f4-bb94-4dbd-a01c-3a2f9ef3098e",
    "approved_at": "2018-05-24T03:31:07.626-07:00",
    "data_collection_checks": [{"id": "a94329ff-47fc-4b9c-8e62-01e0f8e53c91", "status": "pending"}],
}


def sign(body, secret=SECRET) -> str:
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-OBIQ-SIGNATURE-V2"] = signature
    return client.post("/webhooks/fountain", content=body.encode("utf-8"), headers=headers)


class TestSignatureVerification:
    def test_accepts_valid_signature_over_raw_body(self):
        body = json.dumps(APPLICANT)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_exact_bytes(self):
        body = json.dumps({**WORKER, "name": "Zoë Müller"}, indent=2, ensure_ascii=False)
        assert post(body, sign(body)).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = json.dumps(WORKER)
        assert post(body, sign(body).upper()).status_code == 200

    def test_accepts_any_content_type(self):
        body = json.dumps(WORKER)
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_rejects_missing_signature(self):
        assert post(json.dumps(APPLICANT)).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(json.dumps(APPLICANT), "").status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(APPLICANT)
        assert post(body, sign(body, "wrong_token")).status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(APPLICANT)
        assert post(body.replace("Approved", "Rejected"), sign(body)).status_code == 401

    def test_rejects_applicant_id_signature(self):
        body = json.dumps(APPLICANT)
        assert post(body, sign(APPLICANT["applicant"]["id"])).status_code == 401

    def test_rejects_malformed_signatures_without_raising(self):
        body = json.dumps(APPLICANT)
        good = sign(body)
        for bad in [f"sha256={good}", good[:62], good + "00", "z" * 64, good[:32] + " " + good[32:]]:
            assert post(body, bad).status_code == 401

    def test_rejects_everything_when_secret_unset(self):
        body = b"{}"
        assert verify_fountain_signature(body, sign(body), "") is False

    def test_secret_is_utf8_bytes_not_decoded(self):
        body = b"{}"
        secret = "deadbeefdeadbeef"  # looks like hex but must not be hex-decoded
        assert verify_fountain_signature(body, sign(body, secret), secret) is True
        decoded = hmac.new(bytes.fromhex(secret), body, hashlib.sha256).hexdigest()
        assert verify_fountain_signature(body, decoded, secret) is False


class TestBodyHandling:
    def test_400_for_invalid_json_after_verifying(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_400_for_json_array(self):
        assert post("[]", sign("[]")).status_code == 400

    def test_401_not_400_without_valid_signature(self):
        assert post("{not json", "a" * 64).status_code == 401


class TestEventHandling:
    def test_applicant_event(self, capsys):
        body = json.dumps(APPLICANT)
        assert post(body, sign(body)).status_code == 200
        out = capsys.readouterr().out
        assert "is in stage: Approved" in out
        assert "status: pending" in out

    def test_worker_event(self, capsys):
        body = json.dumps(WORKER)
        assert post(body, sign(body)).status_code == 200
        assert "is_active=true" in capsys.readouterr().out

    def test_classifies_by_shape(self):
        assert classify(APPLICANT) == "applicant"
        assert classify(WORKER) == "worker"
        assert classify({"something": "else"}) is None

    def test_acknowledges_unknown_shape(self, capsys):
        body = json.dumps({"something": "else"})
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
