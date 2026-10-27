# Generated with: podium-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import time

import pytest

# The secret is whatever you set when you created the webhook; it is the HMAC key as UTF-8 bytes.
SECRET = "podium_test_secret_0123456789abcdef"
os.environ["PODIUM_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body, timestamp, secret: str = SECRET) -> str:
    """Sign exactly like Podium: HMAC-SHA256(secret, f"{timestamp}.{raw body}") as hex."""
    body = raw_body.encode() if isinstance(raw_body, str) else raw_body
    signed = str(timestamp).encode("latin-1") + b"." + body
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def now() -> int:
    # podium-timestamp is Unix milliseconds (e.g. 1620936594591).
    return int(time.time() * 1000)


def payload_for(event: str) -> str:
    # Podium delivers {"data": ..., "metadata": {"event_type": ..., "version": ...}}.
    return json.dumps(
        {"data": {"uid": "abc-123", "body": "Hello"}, "metadata": {"event_type": event, "version": "2021.04.01"}}
    )


def send(body="", *, method="POST", timestamp=None, signature="auto", secret=SECRET):
    ts = now() if timestamp is None else timestamp
    raw = body.encode() if isinstance(body, str) else body
    headers = {"content-type": "application/json"}
    if timestamp != "omit":
        headers["podium-timestamp"] = str(ts)
    if signature == "auto":
        signature = sign(raw, ts, secret)
    if signature is not None:
        headers["podium-signature"] = signature
    return client.request(method, "/webhooks/podium", content=raw, headers=headers)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PODIUM_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("PODIUM_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestValidDeliveries:
    @pytest.mark.parametrize(
        "event",
        [
            "message.received",
            "message.sent",
            "contact.created",
            "contact.updated",
            "review.created",
            "invoice.payment_succeeded",
            "call.completed",
        ],
    )
    def test_accepts_signed_events(self, event):
        res = send(payload_for(event))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_dispatches_on_metadata_event_type(self, caplog):
        with caplog.at_level("INFO"):
            res = send(payload_for("contact.updated"))
        assert res.status_code == 200
        assert "Contact updated" in caplog.text

    def test_accepts_body_without_metadata(self):
        assert send(json.dumps({"data": {}})).status_code == 200

    def test_accepts_unknown_events(self):
        assert send(payload_for("something_else")).status_code == 200

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_verifies_other_methods(self, method):
        assert send(payload_for("message.received"), method=method).status_code == 200

    def test_verifies_get_with_no_body(self):
        ts = now()
        res = client.get(
            "/webhooks/podium",
            headers={"podium-timestamp": str(ts), "podium-signature": sign(b"", ts)},
        )
        assert res.status_code == 200

    def test_rejects_unsigned_get(self):
        assert client.get("/webhooks/podium").status_code == 401

    def test_verifies_raw_bytes_for_any_content_type(self):
        raw = b"not json at all"
        ts = now()
        res = client.post(
            "/webhooks/podium",
            content=raw,
            headers={
                "content-type": "text/plain",
                "podium-timestamp": str(ts),
                "podium-signature": sign(raw, ts),
            },
        )
        # Signature is valid; the body just isn't JSON.
        assert res.status_code == 400

    def test_signs_raw_bytes_not_reserialised_json(self):
        # Pretty-printed, odd spacing and non-ASCII: json.dumps(json.loads(x)) differs.
        raw = '{\n  "metadata": { "version": "2021.04.01",  "event_type": "message.received" },\n  "data": { "z": 1, "a": "café ☃" }\n}'.encode()
        assert json.dumps(json.loads(raw)).encode() != raw
        assert send(raw).status_code == 200

    def test_accepts_uppercase_hex(self):
        raw = payload_for("message.received")
        ts = now()
        assert send(raw, timestamp=ts, signature=sign(raw, ts).upper()).status_code == 200

    def test_does_not_reject_old_timestamps_by_default(self):
        assert send(payload_for("message.received"), timestamp=now() - 24 * 3600 * 1000).status_code == 200


class TestInvalidDeliveries:
    def test_rejects_tampered_body(self):
        ts = now()
        sig = sign(payload_for("message.received"), ts)
        res = send(payload_for("contact.updated"), timestamp=ts, signature=sig)
        assert res.status_code == 401

    def test_rejects_different_timestamp_than_signed(self):
        raw = payload_for("message.received")
        assert send(raw, timestamp=1001, signature=sign(raw, 1000)).status_code == 401

    def test_rejects_wrong_secret(self):
        assert send(payload_for("message.received"), secret="other_secret").status_code == 401

    def test_uses_secret_as_utf8_text_not_hex_decoded(self, monkeypatch):
        hex_secret = "deadbeef" * 8
        monkeypatch.setenv("PODIUM_WEBHOOK_SECRET", hex_secret)
        raw = payload_for("message.received").encode()
        ts = now()
        decoded = hmac.new(
            bytes.fromhex(hex_secret), str(ts).encode() + b"." + raw, hashlib.sha256
        ).hexdigest()
        assert send(raw, timestamp=ts, signature=decoded).status_code == 401
        assert send(raw, timestamp=ts, secret=hex_secret).status_code == 200

    def test_rejects_missing_signature(self):
        assert send(payload_for("message.received"), signature=None).status_code == 401

    def test_rejects_missing_timestamp(self):
        raw = payload_for("message.received")
        res = send(raw, timestamp="omit", signature=sign(raw, now()))
        assert res.status_code == 401

    def test_rejects_empty_signature(self):
        assert send(payload_for("message.received"), signature="").status_code == 401

    @pytest.mark.parametrize(
        "signature",
        ["abcd", "a" * 66, "z" * 64, "sha256=" + "a" * 64],
        ids=["too-short", "too-long", "non-hex", "prefixed"],
    )
    def test_rejects_malformed_signature(self, signature):
        assert send(payload_for("message.received"), signature=signature).status_code == 401

    def test_returns_400_for_verified_non_json(self):
        assert send("{not json").status_code == 400

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("PODIUM_WEBHOOK_SECRET", raising=False)
        assert send(payload_for("message.received")).status_code == 500


class TestOptInTolerance:
    def test_rejects_old_timestamp_when_set(self, monkeypatch):
        monkeypatch.setenv("PODIUM_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send(payload_for("message.received"), timestamp=now() - 3600 * 1000).status_code == 401

    def test_accepts_fresh_timestamp_when_set(self, monkeypatch):
        monkeypatch.setenv("PODIUM_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send(payload_for("message.received")).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("PODIUM_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert send(payload_for("message.received"), timestamp=now() - 3600 * 1000).status_code == 200
