import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_flagsmith_secret"
os.environ["FLAGSMITH_WEBHOOK_SECRET"] = SECRET

from main import app, verify_flagsmith_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Flagsmith: hex HMAC-SHA256 of the body, keyed with the secret."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


FLAG_UPDATED = json.dumps({
    "event_type": "FLAG_UPDATED",
    "data": {
        "changed_by": "user@domain.com",
        "timestamp": "2021-06-18T07:50:26.595298Z",
        "new_state": {"enabled": True, "feature": {"id": 1, "name": "my_feature"}},
        "previous_state": {"enabled": False, "feature": {"id": 1, "name": "my_feature"}},
    },
}).encode()
FLAG_DELETED = json.dumps({"event_type": "FLAG_DELETED", "data": {"feature": {"id": 1, "name": "my_feature"}}}).encode()
AUDIT_LOG = json.dumps({
    "event_type": "AUDIT_LOG_CREATED",
    "data": {"log": "New Flag / Remote Config created: my_feature", "related_object_type": "FEATURE"},
}).encode()
IDENTITY = json.dumps({"identity": "user_test", "flags": [], "traits": [], "segments": []}).encode()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Flagsmith-Signature"] = signature
    return client.post("/webhooks/flagsmith", content=body, headers=headers)


class TestVerify:
    def test_valid_signature(self):
        assert verify_flagsmith_signature(FLAG_UPDATED, sign(FLAG_UPDATED), SECRET)

    def test_rejects_bad_inputs(self):
        assert not verify_flagsmith_signature(FLAG_UPDATED, sign(FLAG_UPDATED, "other"), SECRET)
        assert not verify_flagsmith_signature(FLAG_UPDATED + b" ", sign(FLAG_UPDATED), SECRET)
        assert not verify_flagsmith_signature(FLAG_UPDATED, "abc", SECRET)
        assert not verify_flagsmith_signature(FLAG_UPDATED, None, SECRET)
        assert not verify_flagsmith_signature(FLAG_UPDATED, sign(FLAG_UPDATED), None)


class TestEndpoint:
    @pytest.mark.parametrize("body", [FLAG_UPDATED, FLAG_DELETED, AUDIT_LOG, IDENTITY])
    def test_accepts_signed_payloads(self, body):
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type(self):
        assert post(FLAG_UPDATED, sign(FLAG_UPDATED), "text/plain").status_code == 200

    def test_unknown_event_type(self):
        body = json.dumps({"event_type": "SOMETHING_NEW", "data": {}}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_missing_signature(self):
        assert post(FLAG_UPDATED).status_code == 400

    def test_invalid_signature(self):
        assert post(FLAG_UPDATED, sign(FLAG_UPDATED, "wrong")).status_code == 400

    def test_signature_over_different_bytes(self):
        assert post(FLAG_UPDATED, sign(AUDIT_LOG)).status_code == 400

    def test_signed_invalid_json(self):
        assert post(b"not json", sign(b"not json"), "text/plain").status_code == 400
