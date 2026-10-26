import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# BigMailer signing secrets are opaque strings; these are only for tests
SECRET = "test_bigmailer_secret_3c9e1f7a"
OLD_SECRET = "old_bigmailer_secret_81d4b6e2"
os.environ["BIGMAILER_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

IDS = {
    "brand_id": "0da934ea-f96f-4f2f-85dd-0e8ceb9cba0e",
    "campaign_id": "9ebe0652-6364-4688-897c-cf2655f988e8",
    "contact_id": "f36999a4-7fc0-4a03-868c-21fad154db1b",
}

# Payloads follow the sample payloads in BigMailer's webhook event type docs
BASE = {
    "date": 1579811821,
    "campaign_id": IDS["campaign_id"],
    "contact_id": IDS["contact_id"],
    "email": "test@example.com",
}
SAMPLES = {
    "bounce": {**BASE, "type": "hard"},
    "click": {**BASE, "link_id": "a1f82283-aa9a-4de8-a803-3860a4df1ce4", "url": "https://www.example.com/"},
    "complaint": BASE,
    "open": BASE,
    "unsubscribe": {
        **BASE,
        "unsubscribe_all": False,
        "unsubscribe_ids": ["48e7b6d6-4c2f-4819-9294-41aaed22f837", "aa3f3b4c-862e-4a00-aadb-0d82e4def938"],
    },
}


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("BIGMAILER_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("BIGMAILER_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def mac(key, ts, body: str) -> str:
    return hmac.new(key.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    """Matches BigMailer's header format: t=<unix>,v1=<hex>."""
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={mac(secret, ts, body)}"


def event(event_type: str) -> str:
    return json.dumps({"type": event_type, "brand_id": IDS["brand_id"], event_type: SAMPLES.get(event_type, BASE)})


def post(body, headers: dict = None, content_type="application/json"):
    return client.post(
        "/webhooks/bigmailer",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def sig(value: str) -> dict:
    return {"X-BigMailer-Signature": value}


class TestSignatureVerification:
    def test_accepts_valid_v1_signature(self):
        body = event("bounce")
        res = post(body, sig(sign(body)))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_documented_header_shape(self):
        import re

        body = event("open")
        header = sign(body)
        assert re.fullmatch(r"t=\d+,v1=[0-9a-f]{64}", header)
        assert post(body, sig(header)).status_code == 200

    def test_accepts_any_matching_v1_entry_first_or_last(self):
        body = event("click")
        t = int(time.time())
        first = f"t={t},v1={mac(SECRET, t, body)},v1={mac(OLD_SECRET, t, body)}"
        last = f"t={t},v1={mac(OLD_SECRET, t, body)},v1={mac(SECRET, t, body)}"
        assert post(body, sig(first)).status_code == 200
        assert post(body, sig(last)).status_code == 200

    def test_ignores_other_schemes_such_as_v0(self):
        body = event("open")
        t = int(time.time())
        good = mac(SECRET, t, body)
        assert post(body, sig(f"t={t},v0={good}")).status_code == 401
        assert post(body, sig(f"t={t},v0={'0' * 64},v1={good}")).status_code == 200

    def test_accepts_uppercase_hex(self):
        body = event("open")
        t = int(time.time())
        assert post(body, sig(f"t={t},v1={mac(SECRET, t, body).upper()}")).status_code == 200

    def test_signs_t_string_exactly_as_sent(self):
        body = event("open")
        t = "0001492774578"
        assert post(body, sig(f"t={t},v1={mac(SECRET, t, body)}")).status_code == 200

    def test_verifies_exact_bytes_including_non_ascii_and_whitespace(self):
        body = '{"type":"open",  "open":{"email":"zoë@example.com"}}\n'
        assert post(body.encode("utf-8"), sig(sign(body))).status_code == 200

    def test_accepts_any_content_type(self):
        body = event("open")
        assert post(body, sig(sign(body)), content_type="text/plain").status_code == 200

    def test_rejects_wrong_secret(self):
        body = event("bounce")
        assert post(body, sig(sign(body, secret="wrong_secret"))).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(event("complaint"), sig(sign(event("open")))).status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = event("open")
        ts = int(time.time())
        header = sign(body, timestamp=ts).replace(f"t={ts}", f"t={ts + 1}", 1)
        assert post(body, sig(header)).status_code == 401

    def test_rejects_missing_or_empty_signature_header(self):
        assert post(event("open")).status_code == 401
        assert post(event("open"), sig("")).status_code == 401

    def test_rejects_header_without_t(self):
        body = event("open")
        digest = hmac.new(SECRET.encode(), f".{body}".encode(), hashlib.sha256).hexdigest()
        assert post(body, sig(f"v1={digest}")).status_code == 401

    @pytest.mark.parametrize(
        "header",
        [
            "garbage",
            "t=abc,v1=deadbeef",
            "t=123",
            "v1=deadbeef",
            "t=123,v1=short",
            "t=123,v1=" + "z" * 64,
            "t=123,v1=" + "a" * 63,
            "t=123,v1=" + "a" * 65,
        ],
    )
    def test_rejects_malformed_header(self, header):
        assert post(event("open"), sig(header)).status_code == 401

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("BIGMAILER_WEBHOOK_SECRET")
        body = event("open")
        assert post(body, sig(sign(body))).status_code == 500


class TestTimestampTolerance:
    old = int(time.time()) - 3600

    def test_off_by_default(self):
        body = event("open")
        assert post(body, sig(sign(body, timestamp=self.old))).status_code == 200

    def test_rejects_old_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("BIGMAILER_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("open")
        assert post(body, sig(sign(body, timestamp=self.old))).status_code == 401

    def test_accepts_fresh_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("BIGMAILER_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("open")
        assert post(body, sig(sign(body))).status_code == 200

    def test_non_numeric_value_is_treated_as_off(self, monkeypatch):
        monkeypatch.setenv("BIGMAILER_WEBHOOK_TOLERANCE_SECONDS", "five minutes")
        body = event("open")
        assert post(body, sig(sign(body, timestamp=self.old))).status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize("event_type", ["bounce", "click", "complaint", "open", "unsubscribe"])
    def test_handles_event(self, event_type, caplog):
        body = event(event_type)
        with caplog.at_level("INFO", logger="bigmailer-webhooks"):
            res = post(body, sig(sign(body)))
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_reads_bounce_kind_from_nested_type(self, caplog):
        body = event("bounce")
        with caplog.at_level("INFO", logger="bigmailer-webhooks"):
            post(body, sig(sign(body)))
        assert "Bounce (hard) for test@example.com" in caplog.text

    def test_acknowledges_unhandled_events(self, caplog):
        body = json.dumps({"type": "delivery", "brand_id": IDS["brand_id"]})
        with caplog.at_level("INFO", logger="bigmailer-webhooks"):
            res = post(body, sig(sign(body)))
        assert res.status_code == 200
        assert "Unhandled event: delivery" in caplog.text

    def test_rejects_validly_signed_non_json(self):
        body = "not json"
        assert post(body, sig(sign(body))).status_code == 400

    @pytest.mark.parametrize("body", ["[]", "null", '"text"', "42"])
    def test_rejects_validly_signed_non_object(self, body):
        assert post(body, sig(sign(body))).status_code == 400

    @pytest.mark.parametrize(
        "payload",
        [
            {"type": "open", "open": "oops"},
            {"type": "open", "open": None},
            {"type": "open", "open": []},
            {"type": "click", "click": 5},
            {"type": "unsubscribe", "unsubscribe": {"unsubscribe_ids": "nope", "unsubscribe_all": "yes"}},
            {"type": "bounce", "bounce": {"type": {"nested": True}, "email": ["x"]}},
            {"type": 42},
            {"type": None},
            {"type": ["open"]},
            {},
        ],
    )
    def test_does_not_500_on_wrong_typed_fields(self, payload):
        body = json.dumps(payload)
        assert post(body, sig(sign(body))).status_code == 200
