import hashlib
import hmac
import json
import os
import time

# Go1 secret_key: max 64 chars, used as a raw UTF-8 string (special characters are part of the key)
SECRET = "MyS3cretK#y"
os.environ["GO1_WEBHOOK_SECRET"] = SECRET

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_go1_webhook  # noqa: E402

client = TestClient(app)


def now_ms() -> int:
    return int(time.time() * 1000)


def sign(body: str, secret: str = SECRET, t: int | None = None) -> str:
    # Go1 `t` is Unix MILLISECONDS
    t = now_ms() if t is None else t
    v1 = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def event(event_type: str) -> dict:
    return {"id": "ABnJ5giCDEFG", "event_type": event_type}


def post(body: str, header: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header:
        headers["Go1-Signature"] = header
    return client.post("/webhooks/go1", content=body, headers=headers)


class TestVerify:
    body = json.dumps(event("enrollment.create"))

    def test_valid_signature(self):
        assert verify_go1_webhook(self.body.encode(), sign(self.body), SECRET)

    def test_t_is_used_verbatim_in_milliseconds(self):
        t = 1706747802205
        header = sign(self.body, t=t)
        assert verify_go1_webhook(self.body.encode(), header, SECRET)
        assert not verify_go1_webhook(self.body.encode(), header.replace(f"t={t}", f"t={t // 1000}"), SECRET)

    def test_wrong_secret(self):
        assert not verify_go1_webhook(self.body.encode(), sign(self.body, "other"), SECRET)

    def test_tampered_body(self):
        assert not verify_go1_webhook((self.body + " ").encode(), sign(self.body), SECRET)

    def test_old_timestamp_accepted_by_default(self, monkeypatch):
        monkeypatch.delenv("GO1_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = now_ms() - 86400 * 1000
        assert verify_go1_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_old_timestamp_rejected_with_explicit_tolerance(self):
        old = now_ms() - 600 * 1000
        assert not verify_go1_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=300)

    def test_fresh_timestamp_accepted_with_tolerance(self):
        assert verify_go1_webhook(self.body.encode(), sign(self.body), SECRET, tolerance=300)

    def test_old_timestamp_rejected_with_env_tolerance(self, monkeypatch):
        monkeypatch.setenv("GO1_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = now_ms() - 600 * 1000
        assert not verify_go1_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_non_numeric_env_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("GO1_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = now_ms() - 600 * 1000
        assert verify_go1_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    @pytest.mark.parametrize("header", ["garbage", "t=abc,v1=00", None, ""])
    def test_malformed_headers(self, header):
        assert not verify_go1_webhook(self.body.encode(), header, SECRET)

    def test_missing_v1(self):
        assert not verify_go1_webhook(self.body.encode(), f"t={now_ms()}", SECRET)

    def test_any_v1_matches(self):
        assert verify_go1_webhook(self.body.encode(), f"{sign(self.body)},v1=deadbeef", SECRET)


class TestEndpoint:
    @pytest.mark.parametrize(
        "event_type",
        ["enrollment.create", "enrollment.update", "enrollment.delete", "something.new"],
    )
    def test_valid_event(self, event_type):
        body = json.dumps(event(event_type))
        assert post(body, sign(body)).status_code == 200

    def test_any_content_type(self):
        body = json.dumps(event("enrollment.create"))
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_invalid_signature(self):
        body = json.dumps(event("enrollment.create"))
        assert post(body, sign(body, "wrong")).status_code == 400

    def test_missing_header(self):
        assert post(json.dumps(event("enrollment.create"))).status_code == 400

    def test_signed_invalid_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_signed_non_object(self):
        body = json.dumps([event("enrollment.create")])
        assert post(body, sign(body)).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
