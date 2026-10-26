import hashlib
import hmac
import itertools
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Subscription secret keys are used as UTF-8 bytes
SECRET = "test_vitable_secret_Zq81xKd2"
os.environ["VITABLE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("VITABLE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("VITABLE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def digest(timestamp, body: bytes, secret=SECRET) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode()
    return hmac.new(key, str(timestamp).encode("latin-1") + b"." + body, hashlib.sha512).hexdigest()


def headers_for(body, timestamp=None, secret=SECRET, prefix="sha512=") -> dict:
    body = body.encode() if isinstance(body, str) else body
    ts = int(time.time()) if timestamp is None else timestamp
    return {
        "X-Vitable-Signature": f"{prefix}{digest(ts, body, secret)}",
        "X-Vitable-Timestamp": str(ts),
    }


def post(body, headers: dict, content_type="application/json"):
    content = body.encode() if isinstance(body, str) else body
    return client.post(
        "/webhooks/vitable-health",
        content=content,
        headers={"Content-Type": content_type, **headers},
    )


_counter = itertools.count(1)


def event_body(**overrides) -> str:
    # Each event gets a fresh event_id, because the handler deduplicates on it
    payload = {
        "event_id": f"wevt_550e8400-e29b-41d4-a716-{next(_counter):012d}",
        "organization_id": "org_xyz789",
        "event_name": "enrollment.accepted",
        "resource_type": "enrollment",
        "resource_id": "enrl_7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "created_at": "2026-01-23T14:30:00+00:00",
        **overrides,
    }
    return json.dumps(payload)


class TestSignatureVerification:
    def test_accepts_valid_sha512_prefixed_signature(self):
        body = event_body()
        res = post(body, headers_for(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_bare_digest_without_prefix(self):
        body = event_body()
        assert post(body, headers_for(body, prefix="")).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = event_body()
        h = headers_for(body)
        h["X-Vitable-Signature"] = "sha512=" + h["X-Vitable-Signature"][7:].upper()
        assert post(body, h).status_code == 200

    def test_verifies_any_content_type_because_body_is_read_raw(self):
        body = event_body()
        assert post(body, headers_for(body), "text/plain").status_code == 200

    def test_verifies_exact_bytes_including_whitespace_and_non_ascii(self):
        body = '{ "event_id" : "wevt_raw_bytes_1",\n  "event_name": "employee.deactivated", "note": "café ✓" }'.encode()
        assert post(body, headers_for(body)).status_code == 200

    def test_rejects_re_serialized_body(self):
        body = '{ "event_id" : "wevt_raw_bytes_2", "event_name": "employee.deactivated" }'
        res = post(json.dumps(json.loads(body)), headers_for(body))
        assert res.status_code == 401

    def test_uses_secret_as_utf8_not_hex_decoded(self):
        hex_looking = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
        body = event_body()
        os.environ["VITABLE_WEBHOOK_SECRET"] = hex_looking
        assert post(body, headers_for(body, secret=hex_looking)).status_code == 200
        decoded = post(body, headers_for(body, secret=bytes.fromhex(hex_looking)))
        assert decoded.status_code == 401

    def test_rejects_wrong_secret(self):
        body = event_body()
        assert post(body, headers_for(body, secret="another_subscription_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        body = event_body()
        tampered = body.replace("enrollment.accepted", "enrollment.terminated")
        assert post(tampered, headers_for(body)).status_code == 401

    def test_rejects_signature_made_over_different_timestamp(self):
        body = event_body()
        h = headers_for(body)
        h["X-Vitable-Timestamp"] = str(int(h["X-Vitable-Timestamp"]) + 1)
        assert post(body, h).status_code == 401

    def test_rejects_missing_signature_header(self):
        body = event_body()
        h = headers_for(body)
        del h["X-Vitable-Signature"]
        assert post(body, h).status_code == 401

    def test_rejects_missing_timestamp_header(self):
        body = event_body()
        h = headers_for(body)
        del h["X-Vitable-Timestamp"]
        assert post(body, h).status_code == 401

    def test_rejects_empty_signature_header(self):
        body = event_body()
        h = {**headers_for(body), "X-Vitable-Signature": ""}
        assert post(body, h).status_code == 401

    def test_rejects_malformed_signatures(self):
        body = event_body()
        now = int(time.time())
        good = digest(now, body.encode())
        bad = [
            "sha512=",
            "sha512=" + good[:127],  # too short
            "sha512=" + good + "0",  # too long
            "sha512=zz" + good[2:],  # not hex
            "sha512=" + good[:126] + "  ",  # spaces in place of hex
            "sha256=" + good,  # wrong prefix
            hmac.new(SECRET.encode(), b"x", hashlib.sha256).hexdigest(),  # SHA-256 length
        ]
        for signature in bad:
            res = post(body, {"X-Vitable-Timestamp": str(now), "X-Vitable-Signature": signature})
            assert res.status_code == 401, signature

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("VITABLE_WEBHOOK_SECRET")
        body = event_body()
        assert post(body, headers_for(body)).status_code == 500


class TestTimestampWindow:
    @staticmethod
    def old() -> int:
        return int(time.time()) - 3600

    def test_does_not_reject_old_timestamps_by_default(self):
        body = event_body()
        assert post(body, headers_for(body, timestamp=self.old())).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("VITABLE_WEBHOOK_TOLERANCE_SECONDS", "0")
        body = event_body()
        assert post(body, headers_for(body, timestamp=self.old())).status_code == 200

    def test_rejects_old_timestamps_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("VITABLE_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event_body()
        assert post(body, headers_for(body, timestamp=self.old())).status_code == 401

    def test_accepts_fresh_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("VITABLE_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event_body()
        assert post(body, headers_for(body)).status_code == 200

    def test_rejects_non_integer_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("VITABLE_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event_body()
        assert post(body, headers_for(body, timestamp="1.5e9")).status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize(
        "name,message",
        [
            ("enrollment.accepted", "Enrollment accepted"),
            ("enrollment.terminated", "Enrollment terminated"),
            ("employee.eligibility_granted", "Employee eligibility granted"),
            ("employee.eligibility_terminated", "Employee eligibility terminated"),
            ("employee.deduction_created", "Payroll deduction created"),
        ],
    )
    def test_handles_event(self, name, message, caplog):
        body = event_body(event_name=name)
        with caplog.at_level(logging.INFO, logger="vitable-health-webhooks"):
            res = post(body, headers_for(body))
        assert res.status_code == 200
        assert any(message in r.getMessage() for r in caplog.records)

    @pytest.mark.parametrize(
        "name",
        [
            "enrollment.elected",
            "enrollment.granted",
            "enrollment.waived",
            "enrollment.started",
            "employee.deactivated",
            "employee.future_event",
        ],
    )
    def test_logs_other_events_as_unhandled(self, name, caplog):
        body = event_body(event_name=name)
        with caplog.at_level(logging.INFO, logger="vitable-health-webhooks"):
            res = post(body, headers_for(body))
        assert res.status_code == 200
        assert any(r.getMessage() == f"Unhandled event: {name}" for r in caplog.records)

    def test_processes_redelivered_event_id_only_once(self, caplog):
        body = event_body()
        with caplog.at_level(logging.INFO, logger="vitable-health-webhooks"):
            first = post(body, headers_for(body))
            second = post(body, headers_for(body))
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
        assert sum("Enrollment accepted" in r.getMessage() for r in caplog.records) == 1

    def test_returns_400_for_signed_body_that_is_not_json(self):
        body = "not json"
        assert post(body, headers_for(body), "text/plain").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
