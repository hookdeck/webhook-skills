import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# BoldSign signing secrets are opaque strings; these are only for tests
SECRET = "test_boldsign_secret_5f0c1a7e"
OLD_SECRET = "old_boldsign_secret_9d2b4c8f"
os.environ["BOLDSIGN_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("BOLDSIGN_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


def sign(body: str, timestamp=None, secret=SECRET, old_secret=None) -> str:
    """Matches BoldSign's header format, including the space after the comma."""
    ts = int(time.time()) if timestamp is None else timestamp

    def mac(key):
        return hmac.new(key.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()

    header = f"t={ts}, s0={mac(secret)}"
    if old_secret:
        header += f", s1={mac(old_secret)}"
    return header


def event(event_type: str) -> str:
    return json.dumps(
        {
            "event": {
                "id": "afceddb1-2eed-4301-ae14-8b96a6b0393a",
                "created": 1669959514,
                "eventType": event_type,
                "environment": "Test",
            },
            "data": {
                "object": "document",
                "documentId": "26b8695f-46d0-4cd4-ba1a-c5a0d595c849",
                "messageTitle": "NDA",
            },
        }
    )


def post(body: str, headers: dict = None, content_type="application/json"):
    return client.post(
        "/webhooks/boldsign",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSignatureVerification:
    def test_accepts_valid_s0_signature(self):
        body = event("Signed")
        res = post(body, {"X-BoldSign-Event": "Signed", "X-BoldSign-Signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_match_on_s1_during_key_rollover(self):
        body = event("Completed")
        header = sign(body, secret="some_other_current_key", old_secret=SECRET)
        assert post(body, {"X-BoldSign-Signature": header}).status_code == 200

    def test_accepts_match_on_s0_when_s1_is_present_and_stale(self):
        body = event("Completed")
        header = sign(body, old_secret=OLD_SECRET)
        assert post(body, {"X-BoldSign-Signature": header}).status_code == 200

    def test_accepts_any_content_type(self):
        body = event("Viewed")
        res = post(body, {"X-BoldSign-Signature": sign(body)}, content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_wrong_secret(self):
        body = event("Signed")
        assert post(body, {"X-BoldSign-Signature": sign(body, secret="wrong_secret")}).status_code == 400

    def test_rejects_tampered_body(self):
        res = post(event("Declined"), {"X-BoldSign-Signature": sign(event("Signed"))})
        assert res.status_code == 400

    def test_rejects_tampered_timestamp(self):
        body = event("Signed")
        header = sign(body)
        ts = int(header.split(",")[0][2:])
        header = header.replace(f"t={ts}", f"t={ts + 1}", 1)
        assert post(body, {"X-BoldSign-Signature": header}).status_code == 400

    def test_rejects_missing_signature_header(self):
        assert post(event("Signed")).status_code == 400

    @pytest.mark.parametrize(
        "header", ["garbage", "t=abc, s0=deadbeef", "t=123", "s0=deadbeef", "t=123, s0=short"]
    )
    def test_rejects_malformed_header(self, header):
        assert post(event("Signed"), {"X-BoldSign-Signature": header}).status_code == 400

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("BOLDSIGN_WEBHOOK_SECRET")
        body = event("Signed")
        assert post(body, {"X-BoldSign-Signature": sign(body)}).status_code == 500


class TestTimestampTolerance:
    old = int(time.time()) - 3600

    def test_off_by_default(self):
        body = event("Signed")
        assert post(body, {"X-BoldSign-Signature": sign(body, timestamp=self.old)}).status_code == 200

    def test_rejects_old_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS", "300")
        body = event("Signed")
        assert post(body, {"X-BoldSign-Signature": sign(body, timestamp=self.old)}).status_code == 400

    def test_accepts_fresh_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS", "300")
        body = event("Signed")
        assert post(body, {"X-BoldSign-Signature": sign(body)}).status_code == 200

    def test_non_numeric_value_is_treated_as_off(self, monkeypatch):
        monkeypatch.setenv("BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        body = event("Signed")
        assert post(body, {"X-BoldSign-Signature": sign(body, timestamp=self.old)}).status_code == 200


class TestVerificationEvent:
    def test_returns_200_without_signature(self):
        assert post(event("Verification"), {"X-BoldSign-Event": "Verification"}).status_code == 200

    def test_returns_200_even_if_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("BOLDSIGN_WEBHOOK_SECRET")
        assert post(event("Verification"), {"X-BoldSign-Event": "Verification"}).status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize(
        "event_type", ["Sent", "Viewed", "Signed", "Completed", "Declined", "Revoked", "Expired"]
    )
    def test_handles_event(self, event_type, caplog):
        body = event(event_type)
        with caplog.at_level("INFO", logger="boldsign-webhooks"):
            res = post(body, {"X-BoldSign-Event": event_type, "X-BoldSign-Signature": sign(body)})
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unhandled_events(self, caplog):
        body = event("TemplateCreated")
        with caplog.at_level("INFO", logger="boldsign-webhooks"):
            res = post(body, {"X-BoldSign-Signature": sign(body)})
        assert res.status_code == 200
        assert "Unhandled event: TemplateCreated" in caplog.text

    def test_rejects_validly_signed_non_json(self):
        body = "not json"
        assert post(body, {"X-BoldSign-Signature": sign(body)}).status_code == 400
