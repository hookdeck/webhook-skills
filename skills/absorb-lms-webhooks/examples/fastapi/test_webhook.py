import hashlib
import hmac
import json
import os
import secrets

# Set test environment variables before importing the app
os.environ["ABSORB_WEBHOOK_SECRET"] = "test_absorb_secret_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_absorb_signature

client = TestClient(app)

SECRET = os.environ["ABSORB_WEBHOOK_SECRET"]

EVENTS = [
    "UserCreated",
    "OnlineCourseActivated",
    "EnrollmentCompletedbyAdmin",
    "EnrollmentCompletedbyLearner",
    "CertificateAwarded",
    "CompetencyAwarded",
    "CourseCreditsAwarded",
    "UserEnrolledinCoursebyAdmin",
    "UserEnrolledinCoursebyLearner",
    "DepartmentCreated",
    "SomethingElse",
]


def sample_payload(event_name="UserCreated"):
    """Lean payload: the event name plus IDs. Only eventName is relied on; the other key
    names are illustrative because Absorb's article doesn't publish them."""
    return {"eventName": event_name, "userId": "user-1", "correlationId": "corr-1"}


def sign(body, secret=SECRET):
    """absorb-signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the Secret Key."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body=None, signature=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    headers = {"content-type": content_type}
    if signature is not None:
        headers["absorb-signature"] = signature
    return client.post("/webhooks/absorb-lms", content=body, headers=headers)


class TestAbsorbWebhook:
    def test_accepts_valid_signature(self):
        body = json.dumps(sample_payload())
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body).upper()).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    def test_verifies_exact_bytes_received(self):
        body = '{ "eventName" :   "UserCreated" }\n'
        assert post(body, sign(body)).status_code == 200

    def test_rejects_wrong_secret(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        signed = json.dumps(sample_payload())
        tampered = json.dumps(sample_payload("CertificateAwarded"))
        assert post(tampered, sign(signed)).status_code == 401

    def test_rejects_random_signature_like_test_webhook(self):
        assert post(signature=secrets.token_hex(32)).status_code == 401

    def test_rejects_missing_signature(self):
        assert post().status_code == 401

    def test_rejects_malformed_signatures(self):
        body = json.dumps(sample_payload())
        good = sign(body)
        for bad in ["abc", good[:62], good + "00", "z" * 64, f"sha256={good}"]:
            assert post(body, bad).status_code == 401

    def test_non_ascii_signature_is_401_not_500(self):
        body = json.dumps(sample_payload())
        res = client.post(
            "/webhooks/absorb-lms",
            content=body,
            headers={"content-type": "application/json", "absorb-signature": ("é" * 64).encode("utf-8")},  # httpx needs bytes for non-ASCII
        )
        assert res.status_code == 401

    def test_invalid_json_after_valid_signature_is_400(self):
        assert post("not json", sign("not json")).status_code == 400

    def test_json_array_is_400(self):
        assert post("[1,2]", sign("[1,2]")).status_code == 400

    @pytest.mark.parametrize("event_name", EVENTS)
    def test_handles_event(self, event_name):
        body = json.dumps(sample_payload(event_name))
        assert post(body, sign(body)).status_code == 200


class TestVerifyAbsorbSignature:
    body = json.dumps(sample_payload()).encode()

    def test_accepts_matching_signature(self):
        assert verify_absorb_signature(self.body, sign(self.body), SECRET) is True

    def test_rejects_when_no_secret_configured(self, monkeypatch):
        monkeypatch.delenv("ABSORB_WEBHOOK_SECRET")
        assert verify_absorb_signature(self.body, sign(self.body)) is False
        assert verify_absorb_signature(self.body, sign(self.body, ""), "") is False

    def test_rejects_missing_or_non_string_signature(self):
        assert verify_absorb_signature(self.body, None, SECRET) is False
        assert verify_absorb_signature(self.body, b"abc", SECRET) is False

    def test_non_ascii_signature_returns_false(self):
        assert verify_absorb_signature(self.body, "é" * 64, SECRET) is False
