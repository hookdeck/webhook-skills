import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from main import app, seen_deliveries, verify_formspree_signature

SECRET = "formspree_test_signing_secret"
client = TestClient(app)


def now() -> int:
    return int(time.time())


def sign(body: bytes, t: str | None = None, secret: str = SECRET) -> str:
    """Sign exactly like Formspree: HMAC-SHA256(secret, b"<t>." + raw body), hex."""
    t = str(now()) if t is None else t
    return hmac.new(secret.encode(), t.encode() + b"." + body, hashlib.sha256).hexdigest()


def header(body: bytes, t: str | None = None, secret: str = SECRET) -> str:
    t = str(now()) if t is None else t
    return f"t={t},v1={sign(body, t, secret)}"


def submission(**extra) -> bytes:
    return json.dumps(
        {
            "form": "xyzabcde",
            "keys": ["name", "email", "message"],
            "submission": {
                "_date": "2026-10-26T10:00:00",
                "name": "Ada",
                "email": "ada@example.com",
                "message": "Hello",
                **extra,
            },
        }
    ).encode()


def post(body: bytes, sig: str | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if sig is not None:
        headers["formspree-signature"] = sig
    return client.post("/webhooks/formspree", content=body, headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    seen_deliveries.clear()
    monkeypatch.setenv("FORMSPREE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("FORMSPREE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestVerifyFormspreeSignature:
    body = submission()

    def test_accepts_valid_signature(self):
        assert verify_formspree_signature(self.body, header(self.body), SECRET)[0]

    def test_accepts_uppercase_hex(self):
        t = str(now())
        h = f"t={t},v1={sign(self.body, t).upper()}"
        assert verify_formspree_signature(self.body, h, SECRET)[0]

    def test_signs_t_exactly_as_in_header(self):
        assert verify_formspree_signature(self.body, header(self.body, "0001700000000"), SECRET)[0]

    def test_accepts_when_any_v1_matches_and_ignores_other_keys(self):
        t = str(now())
        wrong = "a" * 64
        h = f"t={t},v0={wrong},v1={wrong},v1={sign(self.body, t)}"
        assert verify_formspree_signature(self.body, h, SECRET)[0]

    def test_v0_alone_is_not_enough(self):
        t = str(now())
        assert not verify_formspree_signature(self.body, f"t={t},v0={sign(self.body, t)}", SECRET)[0]

    def test_rejects_body_only_signature(self):
        body_only = hmac.new(SECRET.encode(), self.body, hashlib.sha256).hexdigest()
        assert not verify_formspree_signature(self.body, f"t={now()},v1={body_only}", SECRET)[0]

    def test_rejects_tampered_body_wrong_secret_changed_timestamp(self):
        h = header(self.body)
        assert not verify_formspree_signature(submission(name="Eve"), h, SECRET)[0]
        assert not verify_formspree_signature(self.body, header(self.body, secret="other"), SECRET)[0]
        assert not verify_formspree_signature(self.body, "t=1" + h[h.index(",") :], SECRET)[0]

    @pytest.mark.parametrize(
        "h",
        [
            None,
            "",
            "v1=" + "a" * 64,
            "t=,v1=" + "a" * 64,
            "t=1700000000",
            "t=1,t=2,v1=" + "a" * 64,
            "t=1700000000,v1=abc123",
            "t=1700000000,v1=" + "a" * 65,
            "t=1700000000,v1=" + "z" * 64,
            "t=1700000000,v1=" + "é" * 64,
            "not-a-signature",
        ],
    )
    def test_rejects_bad_headers(self, h):
        assert not verify_formspree_signature(self.body, h, SECRET)[0]

    def test_verifies_non_utf8_bytes(self):
        raw = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        assert verify_formspree_signature(raw, header(raw), SECRET)[0]

    def test_no_timestamp_window_by_default(self):
        assert verify_formspree_signature(self.body, header(self.body, "1000000000"), SECRET, 0)[0]

    def test_opt_in_tolerance(self):
        assert not verify_formspree_signature(self.body, header(self.body, "1000000000"), SECRET, 300)[0]
        assert not verify_formspree_signature(self.body, header(self.body, "abc"), SECRET, 300)[0]
        assert verify_formspree_signature(self.body, header(self.body), SECRET, 300)[0]


class TestWebhookEndpoint:
    def test_accepts_signed_submission(self):
        body = submission()
        res = post(body, header(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type(self):
        body = submission()
        assert post(body, header(body), "text/plain").status_code == 200

    def test_rejects_reserialised_json(self):
        body = submission()
        pretty = json.dumps(json.loads(body), indent=2).encode()
        assert post(pretty, header(body)).status_code == 401

    def test_401_for_missing_malformed_or_wrong_signature(self):
        body = submission()
        assert post(body).status_code == 401
        assert post(body, "garbage").status_code == 401
        assert post(body, header(body, secret="other")).status_code == 401

    def test_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("FORMSPREE_WEBHOOK_SECRET")
        body = submission()
        assert post(body, header(body)).status_code == 500

    def test_signed_build_hook_with_empty_body(self):
        assert post(b"", header(b"")).status_code == 200

    @pytest.mark.parametrize("bad", [b"not json", b"[1,2]", b"null"])
    def test_400_for_signed_non_object_bodies(self, bad):
        assert post(bad, header(bad)).status_code == 400

    @pytest.mark.parametrize(
        "payload",
        [
            {"form": 123, "keys": "name", "submission": "oops"},
            {"form": {}, "keys": {"a": 1}, "submission": []},
            {"keys": [1, None, "x"], "submission": {"x": {"nested": True}, "_date": 5}},
            {},
        ],
    )
    def test_wrong_typed_fields_are_ignored(self, payload):
        body = json.dumps(payload).encode()
        assert post(body, header(body)).status_code == 200

    def test_retry_reported_as_duplicate(self):
        body = submission()
        first = post(body, header(body))
        retry = post(body, header(body))
        assert first.json() == {"received": True}
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}

    def test_tolerance_env_var_is_opt_in(self, monkeypatch):
        body = submission()
        old = header(body, "1000000000")
        assert post(body, old).status_code == 200

        seen_deliveries.clear()
        monkeypatch.setenv("FORMSPREE_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(body, old).status_code == 401
        assert post(body, header(body)).status_code == 200
