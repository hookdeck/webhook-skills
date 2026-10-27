# Generated with: salsa-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import pytest

# Salsa secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
# example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"salsa-test-signing-key-0123456789a").decode()

os.environ["SALSA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, resolve_signature_headers  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Salsa does: HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", msg_id=None, timestamp=None, secret=SECRET, signature=None):
    """Build signature headers. `prefix` is 'webhook' (Salsa) or 'svix' (fallback)."""
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/salsa", content=raw_body, headers=headers)


def envelope(event_type, attributes=None):
    """Salsa body shape: {"data": {"type": ..., "attributes": {...}}}."""
    return {"data": {"type": event_type, "attributes": attributes or {}}}


def employer_created():
    return envelope(
        "Employer.created",
        {"category": "LIFECYCLE", "employerId": "er_123", "externalId": "abc"},
    )


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["SALSA_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["SALSA_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_signing_matches_salsa_documented_example(self):
        # Worked example from docs.salsa.dev/docs/consuming-webhooks
        secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
        sig = sign('{"test": 2432232314}', "msg_p5jXN8AQM9LWM0D4loKWxJek", "1614265330", secret)
        assert sig == "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="

    def test_accepts_valid_webhook_headers(self):
        raw = json.dumps(employer_created())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_svix_headers(self):
        raw = json.dumps(employer_created())
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_sets_present(self):
        raw = json.dumps(employer_created())
        headers = signed_headers(raw)
        headers.update({"svix-id": "msg_other", "svix-timestamp": str(now()), "svix-signature": "v1,AAAA"})
        assert post(raw, headers).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{"data":  {"type":"Employer.created",\n"attributes":{"employerId":"er_123"}}}'
        headers = signed_headers(raw)
        headers["content-type"] = "text/plain"
        assert post(raw, headers).status_code == 200

    def test_accepts_multiple_signatures_when_one_is_valid(self):
        raw = json.dumps(employer_created())
        msg_id, ts = "msg_multi", str(now())
        other = "whsec_" + base64.b64encode(b"some-other-secret-value-0123456").decode()
        bad = sign(raw, msg_id, ts, other)
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=f"{bad} {sign(raw, msg_id, ts)}")
        assert post(raw, headers).status_code == 200

    def test_ignores_non_v1_signature_entries(self):
        raw = json.dumps(employer_created())
        msg_id, ts = "msg_v1a", str(now())
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=sign(raw, msg_id, ts).replace("v1,", "v1a,"))
        assert post(raw, headers).status_code == 400

    def test_rejects_tampered_body(self):
        raw = json.dumps(employer_created())
        headers = signed_headers(raw)
        res = post(raw.replace("er_123", "er_999"), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = json.dumps(employer_created())
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-0123456").decode()
        assert post(raw, signed_headers(raw, secret=other)).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(employer_created())
        assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_too_far_in_future(self):
        raw = json.dumps(employer_created())
        assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400

    @pytest.mark.parametrize("name", ["id", "timestamp", "signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(employer_created())
        headers = signed_headers(raw)
        del headers[f"webhook-{name}"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature headers"

    def test_rejects_no_signature_headers(self):
        raw = json.dumps(employer_created())
        assert post(raw, {"content-type": "application/json"}).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["SALSA_WEBHOOK_SECRET"]
        raw = json.dumps(employer_created())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"


EVENTS = [
    ("Employer.created", {"category": "LIFECYCLE", "employerId": "er_123", "externalId": "abc"}),
    ("Employer.updated", {"category": "LIFECYCLE", "employerId": "er_123", "externalId": "abc"}),
    ("Employer.onboardingStatus", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("Worker.created", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("Worker.updated", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("Worker.onboardingStatus", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("PayrollRun.awaitingInput", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("PayrollRun.statusChanged", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("Notification.workerPayday", {"category": "NOTIFICATION", "employerId": "er_123"}),
    ("Notification.employerPayrollRunConfirmation", {"category": "NOTIFICATION", "employerId": "er_123"}),
    ("Document.uploaded", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("AccountingConfiguration.created", {"category": "LIFECYCLE", "employerId": "er_123"}),
    ("AccountingConfiguration.updated", {"category": "LIFECYCLE", "employerId": "er_123"}),
]


class TestEventHandling:
    @pytest.mark.parametrize("event_type,data", EVENTS, ids=[e[0] for e in EVENTS])
    def test_handles_event(self, event_type, data, caplog):
        raw = json.dumps(envelope(event_type, data))
        with caplog.at_level(logging.INFO, logger="salsa-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        raw = json.dumps(envelope("Employer.deleted", {"employerId": "er_123"}))
        with caplog.at_level(logging.INFO, logger="salsa-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Salsa event type: Employer.deleted" in caplog.text

    def test_acknowledges_resent_webhook_id_as_duplicate(self):
        raw = json.dumps(employer_created())
        first = post(raw, signed_headers(raw, msg_id="msg_dedupe_1"))
        assert first.json() == {"received": True}

        retry = post(raw, signed_headers(raw, msg_id="msg_dedupe_1"))  # same webhook-id on resend
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}

    def test_processes_new_webhook_id_for_same_body(self):
        raw = json.dumps(employer_created())
        post(raw, signed_headers(raw, msg_id="msg_dedupe_2"))
        res = post(raw, signed_headers(raw, msg_id="msg_dedupe_3"))
        assert res.json() == {"received": True}


class TestResolveSignatureHeaders:
    def test_maps_svix_headers_when_webhook_id_absent(self):
        h = {"svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x"}
        assert resolve_signature_headers(h) == {
            "webhook-id": "a",
            "webhook-timestamp": "1",
            "webhook-signature": "v1,x",
        }

    def test_returns_none_when_a_header_is_missing(self):
        assert resolve_signature_headers({"webhook-id": "a", "webhook-timestamp": "1"}) is None


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
