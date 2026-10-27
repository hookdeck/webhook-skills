# Generated with: bugsmash-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import time

import pytest

# BugSmash secret_key values look like "bgsmsh_..." and are used whole as the HMAC key.
SECRET = "bgsmsh_test_secret_key_0123456789abcdef"
os.environ["BUGSMASH_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body, timestamp, secret: str = SECRET) -> str:
    """Sign exactly like BugSmash: HMAC-SHA256(secret, f"{timestamp}.{raw body}") as hex."""
    body = raw_body.encode() if isinstance(raw_body, str) else raw_body
    signed = str(timestamp).encode("latin-1") + b"." + body
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def now() -> int:
    return int(time.time())


def payload_for(event: str) -> str:
    # Illustrative payload: BugSmash documents no delivery body.
    return json.dumps({"event": event, "data": {"comment": "Logo is cut off"}})


def send(body="", *, method="POST", timestamp=None, signature="auto", secret=SECRET):
    ts = now() if timestamp is None else timestamp
    raw = body.encode() if isinstance(body, str) else body
    headers = {"content-type": "application/json"}
    if timestamp != "omit":
        headers["x-webhook-timestamp"] = str(ts)
    if signature == "auto":
        signature = sign(raw, ts, secret)
    if signature is not None:
        headers["x-bugsmash-signature"] = signature
    return client.request(method, "/webhooks/bugsmash", content=raw, headers=headers)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("BUGSMASH_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("BUGSMASH_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestValidDeliveries:
    @pytest.mark.parametrize(
        "event", ["new_comment", "comment_replied", "status_changed", "comment_updated"]
    )
    def test_accepts_signed_events(self, event):
        res = send(payload_for(event))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_reads_event_name_from_type(self, caplog):
        with caplog.at_level("INFO"):
            res = send(json.dumps({"type": "status_changed"}))
        assert res.status_code == 200
        assert "Status changed" in caplog.text

    def test_accepts_unknown_events(self):
        assert send(payload_for("something_else")).status_code == 200

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_verifies_other_methods(self, method):
        assert send(payload_for("new_comment"), method=method).status_code == 200

    def test_verifies_get_with_no_body(self):
        ts = now()
        res = client.get(
            "/webhooks/bugsmash",
            headers={"x-webhook-timestamp": str(ts), "x-bugsmash-signature": sign(b"", ts)},
        )
        assert res.status_code == 200

    def test_rejects_unsigned_get(self):
        assert client.get("/webhooks/bugsmash").status_code == 401

    def test_verifies_raw_bytes_for_any_content_type(self):
        raw = b"not json at all"
        ts = now()
        res = client.post(
            "/webhooks/bugsmash",
            content=raw,
            headers={
                "content-type": "text/plain",
                "x-webhook-timestamp": str(ts),
                "x-bugsmash-signature": sign(raw, ts),
            },
        )
        # Signature is valid; the body just isn't JSON.
        assert res.status_code == 400

    def test_signs_raw_bytes_not_reserialised_json(self):
        # Pretty-printed, odd spacing and non-ASCII: json.dumps(json.loads(x)) differs.
        raw = '{\n  "event":  "new_comment",\n  "data": { "z": 1, "a": "café ☃" }\n}'.encode()
        assert json.dumps(json.loads(raw)).encode() != raw
        assert send(raw).status_code == 200

    def test_accepts_uppercase_hex(self):
        raw = payload_for("new_comment")
        ts = now()
        assert send(raw, timestamp=ts, signature=sign(raw, ts).upper()).status_code == 200

    def test_does_not_reject_old_timestamps_by_default(self):
        assert send(payload_for("new_comment"), timestamp=now() - 24 * 3600).status_code == 200


class TestInvalidDeliveries:
    def test_rejects_tampered_body(self):
        ts = now()
        sig = sign(payload_for("new_comment"), ts)
        res = send(payload_for("status_changed"), timestamp=ts, signature=sig)
        assert res.status_code == 401

    def test_rejects_different_timestamp_than_signed(self):
        raw = payload_for("new_comment")
        assert send(raw, timestamp=1001, signature=sign(raw, 1000)).status_code == 401

    def test_rejects_wrong_secret(self):
        assert send(payload_for("new_comment"), secret="bgsmsh_other_secret").status_code == 401

    def test_requires_bgsmsh_prefix_in_key(self):
        res = send(payload_for("new_comment"), secret=SECRET.replace("bgsmsh_", ""))
        assert res.status_code == 401

    def test_rejects_missing_signature(self):
        assert send(payload_for("new_comment"), signature=None).status_code == 401

    def test_rejects_missing_timestamp(self):
        raw = payload_for("new_comment")
        res = send(raw, timestamp="omit", signature=sign(raw, now()))
        assert res.status_code == 401

    def test_rejects_empty_signature(self):
        assert send(payload_for("new_comment"), signature="").status_code == 401

    @pytest.mark.parametrize(
        "signature",
        ["abcd", "a" * 66, "z" * 64, "sha256=" + "a" * 64],
        ids=["too-short", "too-long", "non-hex", "prefixed"],
    )
    def test_rejects_malformed_signature(self, signature):
        assert send(payload_for("new_comment"), signature=signature).status_code == 401

    def test_returns_400_for_verified_non_json(self):
        assert send("{not json").status_code == 400

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("BUGSMASH_WEBHOOK_SECRET", raising=False)
        assert send(payload_for("new_comment")).status_code == 500


class TestOptInTolerance:
    def test_rejects_old_timestamp_when_set(self, monkeypatch):
        monkeypatch.setenv("BUGSMASH_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send(payload_for("new_comment"), timestamp=now() - 3600).status_code == 401

    def test_accepts_fresh_timestamp_when_set(self, monkeypatch):
        monkeypatch.setenv("BUGSMASH_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send(payload_for("new_comment")).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("BUGSMASH_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert send(payload_for("new_comment"), timestamp=now() - 3600).status_code == 200
