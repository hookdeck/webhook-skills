import hashlib
import hmac
import os

import pytest

TEST_SECRET = "test_ultravox_webhook_secret"
os.environ["ULTRAVOX_WEBHOOK_SECRET"] = TEST_SECRET

from datetime import datetime, timezone  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sign(body: bytes, timestamp: str, secret: str = TEST_SECRET) -> str:
    # Ultravox: hex HMAC-SHA256(secret, body bytes + timestamp string, no separator)
    return hmac.new(
        secret.encode(), body + timestamp.encode("latin-1"), hashlib.sha256
    ).hexdigest()


def post(body, timestamp="now", signature="auto"):
    body = body.encode() if isinstance(body, str) else body
    if timestamp == "now":
        timestamp = now_iso()
    headers = {"content-type": "application/json"}
    if signature == "auto":
        signature = sign(body, timestamp or "")
    if signature is not None:
        headers["x-ultravox-webhook-signature"] = signature
    if timestamp is not None:
        headers["x-ultravox-webhook-timestamp"] = timestamp
    return client.post("/webhooks/ultravox", content=body, headers=headers)


def event(name: str) -> str:
    return '{"event": "%s"}' % name


@pytest.mark.parametrize("name", ["call.started", "call.joined", "call.ended", "call.billed"])
def test_accepts_signed_events(name):
    assert post(event(name)).status_code == 204


def test_accepts_unknown_events():
    assert post(event("call.something_new")).status_code == 204


def test_verifies_exact_raw_bytes():
    assert post('{ "event" :  "call.ended" }\n').status_code == 204


def test_accepts_uppercase_hex_signature():
    body = event("call.started").encode()
    ts = now_iso()
    assert post(body, ts, sign(body, ts).upper()).status_code == 204


def test_rejects_missing_signature():
    assert post(event("call.ended"), signature=None).status_code == 401


def test_rejects_empty_signature():
    assert post(event("call.ended"), signature="").status_code == 401


def test_rejects_missing_timestamp():
    assert post(event("call.ended"), timestamp=None, signature="a" * 64).status_code == 401


def test_rejects_wrong_signature():
    assert post(event("call.ended"), signature="a" * 64).status_code == 401


def test_rejects_other_secret():
    body = event("call.ended").encode()
    ts = now_iso()
    assert post(body, ts, sign(body, ts, "other_secret")).status_code == 401


def test_rejects_tampered_body():
    ts = now_iso()
    sig = sign(event("call.ended").encode(), ts)
    assert post(event("call.billed"), ts, sig).status_code == 401


def test_rejects_tampered_timestamp():
    body = event("call.ended").encode()
    sig = sign(body, "2026-01-01T00:00:00.000Z")
    assert post(body, "2026-01-01T00:00:01.000Z", sig).status_code == 401


def test_rejects_malformed_signatures():
    body = event("call.ended").encode()
    ts = now_iso()
    good = sign(body, ts)
    for bad in [good[:62], good + "00", "z" * 64, f"sha256={good}", f"{good},{good}", good + "\n"]:
        assert post(body, ts, bad).status_code == 401


def test_old_timestamps_accepted_by_default():
    assert post(event("call.ended"), timestamp="2020-01-01T00:00:00.000Z").status_code == 204


def test_old_timestamps_rejected_with_tolerance(monkeypatch):
    monkeypatch.setenv("ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS", "60")
    assert post(event("call.ended"), timestamp="2020-01-01T00:00:00.000Z").status_code == 401
    assert post(event("call.ended")).status_code == 204


def test_non_json_body_returns_400():
    assert post("not json").status_code == 400


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("ULTRAVOX_WEBHOOK_SECRET")
    assert post(event("call.ended")).status_code == 500


def test_health():
    assert client.get("/health").status_code == 200
