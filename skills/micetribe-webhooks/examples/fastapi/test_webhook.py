import hashlib
import hmac
import itertools
import json
import time

import pytest
from fastapi.testclient import TestClient

import main

SECRET = "micetribe_test_secret_key"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("MICETRIBE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("MICETRIBE_WEBHOOK_TOLERANCE_SECONDS", raising=False)



client = TestClient(main.app)
_counter = itertools.count(1)


def sample_payload(trigger="registration.updated", registration_id="6a08287fa219e11ac60d2a10"):
    """Shaped like MICEtribe's documented registration.updated sample."""
    return {
        "registration_id": registration_id,
        "data": {
            "registration_data": {"email": "attendee@example.com", "fullname": "Jane Doe", "first_name": "Jane", "last_name": "Doe"},
            "entry_status": "Approved",
            "persona": "attendee",
            "barcode": "ABC123XY",
            "print": {"print_count": 0, "last_printed_at": "", "last_printed_by": ""},
            "checkin": {"attended": False, "checkin_at": ""},
            "payment": {"total_payment": "10.00", "currency": "QAR", "method": "SkipCash"},
        },
        "meta": {
            "event_id": 7337,
            "event_name": "My Event",
            "webhook_name": "crm-sync",
            "occurred_at": "2026-06-01T12:29:11+00:00",
            "trigger": trigger,
            "webhook_url": "https://your-server.com/webhooks/micetribe",
            "request_method": "post",
        },
    }


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """hex HMAC-SHA256( secret, timestamp + "." + raw_body ), built as bytes."""
    return hmac.new(secret.encode(), timestamp.encode("latin-1") + b"." + body, hashlib.sha256).hexdigest()


def now() -> str:
    return str(int(time.time()))


def post(body, signature="auto", timestamp="auto", request_id=None, content_type="application/json"):
    if isinstance(body, str):
        body = body.encode()
    ts = now() if timestamp == "auto" else timestamp
    headers = {"Content-Type": content_type, "X-Request-Id": request_id or f"req-{next(_counter)}"}
    if ts is not None:
        headers["X-Timestamp"] = ts
    sig = sign(body, ts or "") if signature == "auto" else signature
    if sig is not None:
        headers["X-Signature"] = sig
    return client.post("/webhooks/micetribe", content=body, headers=headers)


def payload_bytes(**kwargs) -> bytes:
    return json.dumps(sample_payload(**kwargs)).encode()


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(payload_bytes())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex(self):
        body, ts = payload_bytes(), now()
        assert post(body, signature=sign(body, ts).upper(), timestamp=ts).status_code == 200

    def test_verifies_exact_bytes_not_reserialization(self):
        body = b'{ "registration_id" : "abc",\n "meta":{"trigger":"registration.created"}, "data":{"n":"caf\\u00e9"} }'
        assert post(body).status_code == 200

    def test_verifies_non_ascii_body_and_text_content_type(self):
        body = json.dumps(
            {"registration_id": "r1", "meta": {"trigger": "registration.created"}, "data": {"name": "Zoë 日本"}},
            ensure_ascii=False,
        ).encode("utf-8")
        assert post(body, content_type="text/plain").status_code == 200

    def test_rejects_tampered_body(self):
        body, ts = payload_bytes(), now()
        res = post(body.replace(b"Approved", b"Rejected"), signature=sign(body, ts), timestamp=ts)
        assert res.status_code == 401

    def test_rejects_wrong_secret(self):
        body, ts = payload_bytes(), now()
        assert post(body, signature=sign(body, ts, "other_secret"), timestamp=ts).status_code == 401

    def test_rejects_timestamp_that_differs_from_signed_one(self):
        body = payload_bytes()
        assert post(body, signature=sign(body, "1790000000"), timestamp="1790000001").status_code == 401

    def test_rejects_body_only_signature(self):
        body = payload_bytes()
        bare = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        assert post(body, signature=bare).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(payload_bytes(), signature=None).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(payload_bytes(), signature="").status_code == 401

    def test_rejects_missing_timestamp(self):
        body = payload_bytes()
        assert post(body, signature=sign(body, ""), timestamp=None).status_code == 401

    def test_rejects_malformed_signature(self):
        assert post(payload_bytes(), signature="z" * 64).status_code == 401

    def test_rejects_wrong_length_signature(self):
        assert post(payload_bytes(), signature="abcd").status_code == 401

    def test_rejects_sha256_prefixed_signature(self):
        body, ts = payload_bytes(), now()
        assert post(body, signature="sha256=" + sign(body, ts), timestamp=ts).status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("MICETRIBE_WEBHOOK_SECRET")
        assert post(payload_bytes()).status_code == 500


class TestTimestampTolerance:
    body = json.dumps(sample_payload()).encode()
    ts = "1790000000"

    def test_no_window_by_default(self):
        sig = sign(self.body, self.ts)
        assert main.verify_micetribe_signature(self.body, sig, self.ts, SECRET) == (True, None)

    def test_rejects_old_timestamp_when_opted_in(self):
        sig = sign(self.body, self.ts)
        valid, error = main.verify_micetribe_signature(self.body, sig, self.ts, SECRET, 300, now=1790000000 + 301)
        assert not valid and "tolerance" in error

    def test_accepts_timestamp_inside_window(self):
        sig = sign(self.body, self.ts)
        assert main.verify_micetribe_signature(self.body, sig, self.ts, SECRET, 300, now=1790000000 + 299)[0]

    def test_rejects_non_numeric_timestamp_when_opted_in(self):
        sig = sign(self.body, "yesterday")
        assert not main.verify_micetribe_signature(self.body, sig, "yesterday", SECRET, 300)[0]

    def test_tolerance_from_env(self, monkeypatch):
        assert main.tolerance_from_env() == 0
        monkeypatch.setenv("MICETRIBE_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert main.tolerance_from_env() == 300
        monkeypatch.setenv("MICETRIBE_WEBHOOK_TOLERANCE_SECONDS", "abc")
        assert main.tolerance_from_env() == 0

    def test_opt_in_end_to_end(self, monkeypatch):
        monkeypatch.setenv("MICETRIBE_WEBHOOK_TOLERANCE_SECONDS", "300")
        body, old = payload_bytes(), str(int(time.time()) - 3600)
        assert post(body, signature=sign(body, old), timestamp=old).status_code == 401


class TestEvents:
    @pytest.mark.parametrize(
        "trigger",
        ["registration.created", "registration.updated", "registration.deleted", "registration.attended", "registration.printed"],
    )
    def test_handles_documented_events(self, trigger):
        res = post(payload_bytes(trigger=trigger, registration_id=f"reg-{trigger}"))
        assert res.status_code == 200
        assert res.json()["received"] is True

    def test_accepts_unknown_trigger(self):
        assert post(payload_bytes(trigger="registration.future", registration_id="reg-future")).status_code == 200

    def test_invalid_json_after_valid_signature_is_400(self):
        assert post(b"not json").status_code == 400


class TestIdempotency:
    def test_skips_redelivery_with_same_key(self):
        body = payload_bytes(trigger="registration.created", registration_id="reg-dup")
        first = post(body, request_id="same-delivery")
        second = post(body, request_id="same-delivery")
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
