import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Convox suggests `openssl rand -hex 32`, but the Rack uses the value as its UTF-8 string
SECRET = "9f2c1d7a5b8e4036a1d9c7e2b4f08a63d5e1c9b7a3f2084d6c5b1e9a7f3d2c40"
os.environ["CONVOX_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.delenv("CONVOX_WEBHOOK_TOLERANCE_SECONDS", raising=False)
    monkeypatch.setenv("CONVOX_WEBHOOK_SECRET", SECRET)


def v1_for(body, t, secret=SECRET) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode()
    data = body if isinstance(body, bytes) else body.encode()
    return hmac.new(key, f"{t}.".encode() + data, hashlib.sha256).hexdigest()


def sign(body, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={v1_for(body, ts, secret)}"


def post(body, signature=None, content_type="application/json"):
    headers = {}
    if body is not None:
        headers["Content-Type"] = content_type
    if signature is not None:
        headers["Convox-Signature"] = signature
    return client.post("/webhooks/convox", content=body, headers=headers)


def event(action: str, status: str = "success", **data) -> str:
    """Shape of the payload in Convox's docs (app:budget:auto-shutdown:cancelled)."""
    return json.dumps(
        {
            "action": action,
            "status": status,
            "timestamp": "2026-04-27T10:30:00Z",
            "data": {
                "app": "myapp",
                "rack": "rack1",
                "actor": "alice@example.com",
                "tick_id": "tick-2026-04-27T10:30:00Z-3a7b4c2d8e9f4a6b8c4d3e2f1a0b9c8d",
                **data,
            },
        }
    )


@pytest.mark.parametrize(
    "action",
    [
        "app:create",
        "build:create",
        "release:promote",
        "app:budget:cap",
        "app:budget:auto-shutdown:fired",
        "app:budget:auto-shutdown:cancelled",
        "release:manifest-advisory",
        "app:something:new",
    ],
)
def test_accepts_valid_signature(action):
    body = event(action)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_handles_failed_build():
    body = event("build:create", "error", message="docker build failed")
    assert post(body, sign(body)).status_code == 200


def test_verifies_any_content_type():
    body = event("app:create")
    assert post(body, sign(body), "text/plain").status_code == 200


def test_accepts_uppercase_hex():
    body = event("app:create")
    t = int(time.time())
    assert post(body, f"t={t},v1={v1_for(body, t).upper()}").status_code == 200


def test_accepts_when_any_v1_matches():
    body = event("app:create")
    t = int(time.time())
    old = v1_for(body, t, "previous-key")
    current = v1_for(body, t)
    assert post(body, f"t={t},v1={old},v1={current}").status_code == 200
    assert post(body, f"t={t},v1={current},v1={old}").status_code == 200


def test_rejects_when_no_v1_matches():
    body = event("app:create")
    t = int(time.time())
    sig = f"t={t},v1={v1_for(body, t, 'a')},v1={v1_for(body, t, 'b')}"
    assert post(body, sig).status_code == 401


def test_ignores_unknown_keys_such_as_v0():
    body = event("app:create")
    t = int(time.time())
    assert post(body, f"v0={'0' * 64},t={t},v1={v1_for(body, t)}").status_code == 200


def test_does_not_accept_v0_only_signature():
    body = event("app:create")
    t = int(time.time())
    assert post(body, f"t={t},v0={v1_for(body, t)}").status_code == 401


def test_uses_key_as_utf8_string_not_hex_decoded():
    body = event("app:create")
    t = int(time.time())
    wrong = v1_for(body, t, bytes.fromhex(SECRET))
    assert post(body, f"t={t},v1={wrong}").status_code == 401


def test_signs_t_exactly_as_it_appears_in_the_header():
    body = event("app:create")
    t = "0001714233600"
    assert post(body, f"t={t},v1={v1_for(body, t)}").status_code == 200
    # The same signature fails if t were re-formatted as a number
    assert post(body, f"t={t},v1={v1_for(body, int(t))}").status_code == 401


def test_verifies_exact_bytes_with_non_ascii():
    body = event("app:create", actor="zoë@example.com")
    assert post(body.encode("utf-8"), sign(body)).status_code == 200


def test_rejects_tampered_body():
    assert post(event("app:budget:cap"), sign(event("app:create"))).status_code == 401


def test_rejects_wrong_key():
    body = event("app:create")
    assert post(body, sign(body, secret="wrong-key")).status_code == 401


def test_rejects_missing_header():
    assert post(event("app:create")).status_code == 401


def test_rejects_empty_header():
    assert post(event("app:create"), "").status_code == 401


@pytest.mark.parametrize(
    "build",
    [
        pytest.param(lambda b: f"v1={v1_for(b, 1714233600)}", id="no-t"),
        pytest.param(lambda b: f"t=,v1={v1_for(b, 1714233600)}", id="empty-t"),
        pytest.param(lambda b: f"t=abc,v1={v1_for(b, 'abc')}", id="non-numeric-t"),
        pytest.param(lambda b: "t=1714233600", id="no-v1"),
        pytest.param(lambda b: f"t=1714233600,v1={v1_for(b, 1714233600)[:62]}", id="short-v1"),
        pytest.param(lambda b: f"t=1714233600,v1={v1_for(b, 1714233600)}00", id="long-v1"),
        pytest.param(lambda b: f"t=1714233600,v1={'z' * 64}", id="non-hex-v1"),
        pytest.param(lambda b: "not-a-signature", id="garbage"),
    ],
)
def test_rejects_malformed_header(build):
    body = event("app:create")
    assert post(body, build(body)).status_code == 401


def test_rejects_empty_body():
    assert post(None, sign(event("app:create"))).status_code == 401


def test_returns_400_for_signed_body_that_is_not_json():
    body = "not json"
    assert post(body, sign(body), "text/plain").status_code == 400


def test_returns_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("CONVOX_WEBHOOK_SECRET")
    body = event("app:create")
    assert post(body, sign(body)).status_code == 500


class TestTimestampTolerance:
    old = int(time.time()) - 3600

    def test_off_by_default_so_old_timestamp_passes(self):
        body = event("app:create")
        assert post(body, sign(body, self.old)).status_code == 200

    def test_rejects_old_timestamps_when_opted_in(self, monkeypatch):
        monkeypatch.setenv("CONVOX_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("app:create")
        assert post(body, sign(body, self.old)).status_code == 401
        assert post(body, sign(body)).status_code == 200

    @pytest.mark.parametrize("value", ["0", "", "five minutes", "-5"])
    def test_zero_and_non_numeric_values_are_off(self, monkeypatch, value):
        monkeypatch.setenv("CONVOX_WEBHOOK_TOLERANCE_SECONDS", value)
        body = event("app:create")
        assert post(body, sign(body, self.old)).status_code == 200
