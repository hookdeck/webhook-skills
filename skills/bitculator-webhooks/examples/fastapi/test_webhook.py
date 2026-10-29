import base64
import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Bitculator signing secrets look like whsec_<random> and are used as plain strings, prefix included
# (not base64-decoded); this one is only for tests.
SECRET = "whsec_k5cQ1x9jJ2mW7pR4tY8uB3nV6zA0sD5f"
os.environ["BITCULATOR_WEBHOOK_SECRET"] = SECRET

from main import app, verify_bitculator  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _env(monkeypatch, caplog):
    monkeypatch.setenv("BITCULATOR_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("BITCULATOR_WEBHOOK_TOLERANCE_SECONDS", raising=False)
    caplog.set_level(logging.INFO, logger="bitculator-webhooks")


def v1_for(body, ts, secret=SECRET) -> str:
    """v1 = HMAC-SHA256 hex of "<t>.<raw body>"."""
    key = secret if isinstance(secret, bytes) else secret.encode()
    raw = body if isinstance(body, bytes) else body.encode()
    return hmac.new(key, f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()


def sign(body, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={v1_for(body, ts, secret)}"


def post(body, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Bitculator-Signature"] = signature
    return client.post("/webhooks/bitculator", content=body, headers=headers)


def event(**overrides) -> str:
    # ILLUSTRATIVE body: Bitculator does not document the delivery payload. Only `test: true` is a
    # documented fact; data.alarm mirrors an item of GET /api/v1/alarms.
    body = {
        "event": "alarm.triggered",
        "test": True,
        "data": {
            "alarm": {
                "id": 42,
                "name": "BTC above 100k",
                "coin": {"slug": "bitcoin", "symbol": "BTC", "name": "Bitcoin"},
                "metric": "rate",
                "direction": "above",
                "target": "100000",
                "notification": "webhook",
                "status": "triggered",
                "created_at": "2026-01-15T10:00:00Z",
            }
        },
    }
    body.update(overrides)
    return json.dumps(body)


class TestValidSignatures:
    def test_accepts_alarm_triggered(self, caplog):
        body = event()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Test alarm triggered: BTC above 100k BTC above 100000" in caplog.text

    def test_verifies_bytes_directly_and_rejects_non_ascii_digits_in_t(self):
        body = b'{"hello":"world"}'
        assert verify_bitculator(body, sign(body, "1700000000"), SECRET) is True
        # Full-width digits count as digits for str.isdigit(); t must be ASCII 0-9
        t = "１７００００００００"
        assert verify_bitculator(body, f"t={t},v1={v1_for(body, t)}", SECRET) is False

    def test_any_content_type(self):
        body = event()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_assumes_alarm_triggered_without_event_name(self, caplog):
        body = json.dumps({"something": "else"})
        assert post(body, sign(body)).status_code == 200
        assert "alarm triggered: (unnamed)" in caplog.text

    def test_reads_event_name_from_type(self, caplog):
        body = json.dumps({"type": "alarm.other"})
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: alarm.other" in caplog.text

    def test_acknowledges_non_json_body(self):
        body = "not json at all"
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_acknowledges_non_utf8_body(self):
        body = b"\xff\xfe\x00 binary"
        assert post(body, sign(body), "application/octet-stream").status_code == 200

    @pytest.mark.parametrize("body", ["[1,2,3]", "null", '"text"', "42"])
    def test_acknowledges_non_object_json(self, body):
        assert post(body, sign(body)).status_code == 200

    @pytest.mark.parametrize(
        "payload",
        [
            {"event": 5, "data": "x"},
            {"event": "alarm.triggered", "test": "yes", "data": []},
            {"event": "alarm.triggered", "data": {"alarm": "nope"}},
            {"event": "alarm.triggered", "data": {"alarm": {"name": 7, "coin": [], "direction": {}, "target": 100000}}},
            {"event": "alarm.triggered", "data": {"alarm": {"coin": {"symbol": 1}}}},
        ],
    )
    def test_ignores_wrong_typed_fields(self, payload):
        body = json.dumps(payload)
        assert post(body, sign(body)).status_code == 200

    def test_secret_is_whole_string_bytes_not_stripped_or_decoded(self):
        body = event()
        t = int(time.time())
        stripped = SECRET[len("whsec_"):]
        padded = stripped + "=" * (-len(stripped) % 4)
        for key in (stripped, base64.b64decode(padded, altchars=None, validate=False)):
            assert post(body, f"t={t},v1={v1_for(body, t, key)}").status_code == 401

    def test_signs_t_exactly_as_in_header(self):
        body = event()
        t = "01700000000"  # leading zero: int() and re-formatting would change it
        assert post(body, f"t={t},v1={v1_for(body, t)}").status_code == 200
        assert post(body, f"t={t},v1={v1_for(body, int(t))}").status_code == 401

    def test_verifies_exact_bytes_not_reserialised_json(self):
        body = '{ "event" : "alarm.triggered",   "test": true }'
        assert post(body, sign(body)).status_code == 200
        compact = json.dumps(json.loads(body), separators=(",", ":"))
        assert post(body, sign(compact)).status_code == 401

    def test_accepts_uppercase_hex(self):
        body = event()
        t = int(time.time())
        assert post(body, f"t={t},v1={v1_for(body, t).upper()}").status_code == 200

    def test_any_matching_v1_and_other_keys_ignored(self):
        body = event()
        t = int(time.time())
        wrong = "a" * 64
        header = f"v0={wrong},v1={wrong},t={t},v1={v1_for(body, t)},extra=1"
        assert post(body, header).status_code == 200


class TestInvalidSignatures:
    def test_missing_header(self):
        assert post(event()).status_code == 401

    def test_empty_header(self):
        assert post(event(), "").status_code == 401

    def test_tampered_body(self):
        body = event()
        assert post(body.replace("100000", "1"), sign(body)).status_code == 401

    def test_wrong_secret(self):
        body = event()
        assert post(body, sign(body, secret="whsec_wrong")).status_code == 401

    def test_missing_t(self):
        body = event()
        assert post(body, f"v1={v1_for(body, int(time.time()))}").status_code == 401

    @pytest.mark.parametrize("t", ["abc", "12.5", "-5", "1e9", ""])
    def test_non_digit_t(self, t):
        body = event()
        assert post(body, f"t={t},v1={v1_for(body, t)}").status_code == 401

    def test_missing_v1(self):
        assert post(event(), f"t={int(time.time())}").status_code == 401

    @pytest.mark.parametrize(
        "v1",
        ["abcd", "a" * 66, "z" * 64, ""],
        ids=["too-short", "too-long", "not-hex", "empty"],
    )
    def test_malformed_v1(self, v1):
        body = event()
        assert post(body, f"t={int(time.time())},v1={v1}").status_code == 401

    def test_non_ascii_v1_is_401_not_a_server_error(self):
        # Starlette decodes header bytes as latin-1, so a non-ASCII value reaches the verifier;
        # comparing it as str would raise TypeError in compare_digest
        body = event()
        header = f"t={int(time.time())},v1=".encode() + ("é" * 64).encode("latin-1")
        res = client.post(
            "/webhooks/bitculator",
            content=body,
            headers={"Content-Type": "application/json", "X-Bitculator-Signature": header},
        )
        assert res.status_code == 401
        assert verify_bitculator(body.encode(), header.decode("latin-1"), SECRET) is False

    def test_unset_secret_is_500(self, monkeypatch):
        monkeypatch.delenv("BITCULATOR_WEBHOOK_SECRET")
        body = event()
        assert post(body, sign(body)).status_code == 500


class TestTimestampWindow:
    old = int(time.time()) - 3600

    def test_off_by_default(self):
        body = event()
        assert post(body, sign(body, self.old)).status_code == 200

    def test_zero_is_off(self, monkeypatch):
        monkeypatch.setenv("BITCULATOR_WEBHOOK_TOLERANCE_SECONDS", "0")
        body = event()
        assert post(body, sign(body, self.old)).status_code == 200

    def test_rejects_old_timestamp_at_300(self, monkeypatch):
        monkeypatch.setenv("BITCULATOR_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event()
        assert post(body, sign(body, self.old)).status_code == 401

    def test_rejects_future_timestamp_at_300(self, monkeypatch):
        monkeypatch.setenv("BITCULATOR_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event()
        assert post(body, sign(body, int(time.time()) + 3600)).status_code == 401

    def test_accepts_fresh_timestamp_at_300(self, monkeypatch):
        monkeypatch.setenv("BITCULATOR_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event()
        assert post(body, sign(body, int(time.time()) - 100)).status_code == 200

    def test_invalid_value_leaves_check_off(self, monkeypatch):
        monkeypatch.setenv("BITCULATOR_WEBHOOK_TOLERANCE_SECONDS", "five minutes")
        body = event()
        assert post(body, sign(body, self.old)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
