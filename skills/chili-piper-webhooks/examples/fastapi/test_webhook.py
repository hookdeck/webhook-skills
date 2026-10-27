import hashlib
import hmac
import os
import time

import pytest
from fastapi.testclient import TestClient

# The secret is issued by Chili Piper support and used as plain UTF-8 bytes
SECRET = "test_chili_piper_secret"
os.environ["CHILI_PIPER_WEBHOOK_SECRET"] = SECRET

from main import app, is_timestamp_fresh, verify_chili_piper_signature  # noqa: E402

client = TestClient(app)

# Fixed vector (made up for this skill, computed with openssl)
VECTOR_TIMESTAMP = "1742589000"
VECTOR_BODY = '{"meetingIdChili":"123e4567-e89b-12d3-a456-426614174000","type":"Created"}'
VECTOR_SIGNATURE = "6a44e57295b1df93c32af22231c457052e8ae688ac1856f7320f39a7b2fb67bf"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("CHILI_PIPER_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def sign(body: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Chili Piper: hex(HMAC-SHA256(secret, f"{timestamp}.{body}"))."""
    return hmac.new(
        secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()


def now_ts() -> str:
    return str(int(time.time()))


def meeting(event_type: str) -> str:
    import json

    return json.dumps(
        {
            "meetingIdChili": "123e4567-e89b-12d3-a456-426614174000",
            "meetingTitle": "Demo Meeting",
            "meetingStartTime": "2025-03-21T20:30:00Z",
            "assigneeEmail": "support@example.com",
            "type": event_type,
        }
    )


def post(body: str, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/chili-piper",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestVerifySignature:
    def test_matches_fixed_vector(self):
        assert sign(VECTOR_BODY, VECTOR_TIMESTAMP) == VECTOR_SIGNATURE
        assert verify_chili_piper_signature(
            VECTOR_BODY.encode(), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET
        )

    def test_accepts_uppercase_hex(self):
        assert verify_chili_piper_signature(
            VECTOR_BODY.encode(), VECTOR_SIGNATURE.upper(), VECTOR_TIMESTAMP, SECRET
        )

    def test_rejects_changed_timestamp_body_or_secret(self):
        body = VECTOR_BODY.encode()
        assert not verify_chili_piper_signature(body, VECTOR_SIGNATURE, "1742589001", SECRET)
        assert not verify_chili_piper_signature(
            (VECTOR_BODY + " ").encode(), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET
        )
        assert not verify_chili_piper_signature(body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, "other")

    def test_rejects_missing_or_malformed_values(self):
        body = VECTOR_BODY.encode()
        assert not verify_chili_piper_signature(body, None, VECTOR_TIMESTAMP, SECRET)
        assert not verify_chili_piper_signature(body, "", VECTOR_TIMESTAMP, SECRET)
        assert not verify_chili_piper_signature(body, VECTOR_SIGNATURE, None, SECRET)
        assert not verify_chili_piper_signature(body, VECTOR_SIGNATURE, "", SECRET)
        assert not verify_chili_piper_signature(body, "abc", VECTOR_TIMESTAMP, SECRET)
        assert not verify_chili_piper_signature(body, "sha256=" + VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)
        assert not verify_chili_piper_signature(body, VECTOR_SIGNATURE[:63] + "g", VECTOR_TIMESTAMP, SECRET)
        assert not verify_chili_piper_signature(body, VECTOR_SIGNATURE + "\n", VECTOR_TIMESTAMP, SECRET)


class TestTimestampFresh:
    NOW = 1742589000.0

    def test_off_when_zero(self):
        assert is_timestamp_fresh("1", 0, self.NOW)

    def test_enforced_when_enabled(self):
        assert is_timestamp_fresh("1742588800", 300, self.NOW)
        assert not is_timestamp_fresh("1742588000", 300, self.NOW)
        assert not is_timestamp_fresh("not-a-number", 300, self.NOW)


class TestWebhookEndpoint:
    @pytest.mark.parametrize("event_type", ["Created", "Updated", "Deleted"])
    def test_accepts_signed_event(self, event_type):
        body, ts = meeting(event_type), now_ts()
        res = post(body, {"X-Chili-Signature": sign(body, ts), "X-Chili-Timestamp": ts})
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": event_type}

    def test_verifies_bytes_whatever_the_content_type(self):
        body, ts = meeting("Created"), now_ts()
        res = post(body, {"X-Chili-Signature": sign(body, ts), "X-Chili-Timestamp": ts}, "text/plain")
        assert res.status_code == 200

    def test_missing_signature_returns_401(self):
        res = post(meeting("Created"), {"X-Chili-Timestamp": now_ts()})
        assert res.status_code == 401

    def test_missing_timestamp_returns_401(self):
        body = meeting("Created")
        res = post(body, {"X-Chili-Signature": sign(body, now_ts())})
        assert res.status_code == 401

    def test_malformed_signature_returns_401(self):
        res = post(meeting("Created"), {"X-Chili-Signature": "zz", "X-Chili-Timestamp": now_ts()})
        assert res.status_code == 401

    def test_wrong_secret_returns_401(self):
        body, ts = meeting("Created"), now_ts()
        res = post(body, {"X-Chili-Signature": sign(body, ts, "wrong"), "X-Chili-Timestamp": ts})
        assert res.status_code == 401

    def test_altered_body_returns_401(self):
        ts = now_ts()
        res = post(meeting("Deleted"), {"X-Chili-Signature": sign(meeting("Created"), ts), "X-Chili-Timestamp": ts})
        assert res.status_code == 401

    def test_old_timestamp_accepted_by_default(self):
        body = meeting("Created")
        res = post(body, {"X-Chili-Signature": sign(body, "1000000000"), "X-Chili-Timestamp": "1000000000"})
        assert res.status_code == 200

    def test_old_timestamp_rejected_with_tolerance(self, monkeypatch):
        monkeypatch.setenv("CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = meeting("Created")
        res = post(body, {"X-Chili-Signature": sign(body, "1000000000"), "X-Chili-Timestamp": "1000000000"})
        assert res.status_code == 401

    def test_signed_non_json_returns_400(self):
        body, ts = "not json", now_ts()
        res = post(body, {"X-Chili-Signature": sign(body, ts), "X-Chili-Timestamp": ts})
        assert res.status_code == 400

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("CHILI_PIPER_WEBHOOK_SECRET")
        body, ts = meeting("Created"), now_ts()
        res = post(body, {"X-Chili-Signature": sign(body, ts), "X-Chili-Timestamp": ts})
        assert res.status_code == 500

    def test_unknown_event_type_acknowledged(self):
        body, ts = meeting("Rescheduled"), now_ts()
        res = post(body, {"X-Chili-Signature": sign(body, ts), "X-Chili-Timestamp": ts})
        assert res.status_code == 200
