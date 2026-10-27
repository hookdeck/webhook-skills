import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone

# Chameleon's Webhook Secret is used as-is, as UTF-8 text.
os.environ["CHAMELEON_WEBHOOK_SECRET"] = "chameleon_test_secret_0123456789"
os.environ.pop("CHAMELEON_SENT_AT_TOLERANCE_SECONDS", None)

import pytest
from fastapi.testclient import TestClient

from main import app, seen_event_ids, sent_at_within_tolerance, verify_chameleon_signature

client = TestClient(app)

SECRET = os.environ["CHAMELEON_WEBHOOK_SECRET"]

EVENTS = [
    "ping", "response.finished", "alert.triggered",
    "helpbar.answer", "helpbar.search", "helpbar.item.action", "helpbar.item.error",
    "tour.started", "tour.completed", "tour.exited", "tour.snoozed", "tour.button.clicked",
    "survey.started", "survey.completed", "survey.exited", "survey.snoozed", "survey.button.clicked",
    "embed.started", "embed.completed", "embed.exited", "embed.snoozed", "embed.button.clicked",
    "demo.started", "demo.reveal", "demo.finished", "demo.form.submitted",
]


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    seen_event_ids.clear()
    monkeypatch.delenv("CHAMELEON_SENT_AT_TOLERANCE_SECONDS", raising=False)


def sign(body: bytes, secret: str = SECRET) -> str:
    """The signature is the bare lowercase hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def sample_payload(kind="ping", event_id="5fb70dcbc39330000325a817", sent_at="2029-12-11T00:28:59.650Z"):
    """Based on the documented ping example."""
    return {
        "id": event_id,
        "kind": kind,
        "sent_at": sent_at,
        "data": {
            "account": {"id": "58918bc07de121000432e9c0", "domain": "acme.co", "name": "Acme Corp"},
            "profile": {"id": "5f885a88e7daf3000e3eb4f6", "email": "jane@example.com", "uid": "92340834"},
        },
    }


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-chameleon-signature"] = signature
    return client.post("/webhooks/chameleon", content=body, headers=headers)


class TestVerifyChameleonSignature:
    body = json.dumps(sample_payload()).encode()

    def test_accepts_valid_signature(self):
        assert verify_chameleon_signature(self.body, sign(self.body))

    def test_accepts_uppercase_hex(self):
        assert verify_chameleon_signature(self.body, sign(self.body).upper())

    def test_rejects_wrong_secret(self):
        assert not verify_chameleon_signature(self.body, sign(self.body, "other_secret"))

    def test_rejects_tampered_body(self):
        assert not verify_chameleon_signature(b'{"kind":"x"}', sign(self.body))

    @pytest.mark.parametrize("sig", [
        None, "", "abc123", "a" * 66, "z" * 64, "sha256=" + "a" * 64, " " + "a" * 64, "a" * 64 + "\n",
    ])
    def test_rejects_malformed_signature(self, sig):
        assert not verify_chameleon_signature(self.body, sig)

    def test_rejects_when_no_secret(self):
        assert not verify_chameleon_signature(self.body, sign(self.body), "")

    def test_signs_bytes_not_reserialized_json(self):
        spaced = b'{ "id": "1",  "kind": "ping" }'
        assert verify_chameleon_signature(spaced, sign(spaced))
        assert not verify_chameleon_signature(spaced, sign(json.dumps(json.loads(spaced)).encode()))


class TestWebhookEndpoint:
    @pytest.mark.parametrize("kind", EVENTS)
    def test_accepts_signed_event(self, kind):
        body = json.dumps(sample_payload(kind)).encode()
        response = post(body, sign(body))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_any_content_type(self):
        body = json.dumps(sample_payload("tour.completed")).encode()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_rejects_missing_signature(self):
        assert post(json.dumps(sample_payload()).encode()).status_code == 401

    def test_rejects_invalid_signature(self):
        body = json.dumps(sample_payload()).encode()
        assert post(body, sign(body, "wrong")).status_code == 401

    def test_rejects_malformed_signature(self):
        assert post(json.dumps(sample_payload()).encode(), "not-hex").status_code == 401

    def test_rejects_body_modified_after_signing(self):
        body = json.dumps(sample_payload()).encode()
        assert post(body.replace(b"ping", b"tour.completed"), sign(body)).status_code == 401

    def test_returns_400_for_signed_non_json(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400

    def test_returns_400_for_signed_json_without_kind(self):
        body = json.dumps({"id": "1"}).encode()
        assert post(body, sign(body)).status_code == 400

    def test_acknowledges_unknown_kind(self):
        body = json.dumps(sample_payload("future.topic")).encode()
        assert post(body, sign(body)).status_code == 200

    def test_acknowledges_retried_delivery_without_reprocessing(self):
        body = json.dumps(sample_payload("tour.completed", "evt-dup")).encode()
        assert post(body, sign(body)).json() == {"received": True}
        assert post(body, sign(body)).json() == {"received": True, "duplicate": True}


class TestOptionalSentAtCheck:
    def test_off_by_default(self):
        body = json.dumps(sample_payload("ping")).encode()
        assert post(body, sign(body)).status_code == 200

    def test_rejects_stale_sent_at_when_enabled(self, monkeypatch):
        monkeypatch.setenv("CHAMELEON_SENT_AT_TOLERANCE_SECONDS", "300")
        old = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        body = json.dumps(sample_payload("ping", "evt-old", old)).encode()
        assert post(body, sign(body)).status_code == 400

    def test_accepts_fresh_sent_at_when_enabled(self, monkeypatch):
        monkeypatch.setenv("CHAMELEON_SENT_AT_TOLERANCE_SECONDS", "300")
        fresh = datetime.now(timezone.utc).isoformat()
        body = json.dumps(sample_payload("ping", "evt-new", fresh)).encode()
        assert post(body, sign(body)).status_code == 200

    def test_helper_handles_bad_input(self):
        assert not sent_at_within_tolerance("garbage", 300)
        assert not sent_at_within_tolerance(None, 300)
