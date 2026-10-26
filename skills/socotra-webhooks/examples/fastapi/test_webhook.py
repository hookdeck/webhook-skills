import hashlib
import hmac
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Endpoint secret: 8-64 alphanumerics or underscores. Used as UTF-8 bytes.
SECRET = "socotra_test_secret_0123456789"
os.environ["SOCOTRA_WEBHOOK_SECRET"] = SECRET

from main import app, verify_socotra_signature  # noqa: E402

client = TestClient(app)


def sign(body, t=None, secret=SECRET, tag=None):
    """Real signing, as Socotra does it: HMAC-SHA256 over "<t>.<body>" (t in Unix ms), hex."""
    if isinstance(body, str):
        body = body.encode()
    t = t if t is not None else str(int(time.time() * 1000))
    message = t.encode() + b"." + body
    if tag is not None:
        message += b"." + tag.encode()
    v1 = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    header = f"t={t},v1={v1}" + (f",tag={tag}" if tag is not None else "")
    return t, v1, header


def event(event_type):
    return (
        '{"locator":"9a8b7c6d-1111-2222-3333-444455556666","requestId":"req-1",'
        f'"userLocator":"user-1","timestamp":1695835536078,"type":"{event_type}","data":{{}}}}'
    )


def send(body, header=None, method="POST"):
    headers = {"content-type": "application/json"}
    if header is not None:
        headers["socotra-signature"] = header
    return client.request(method, "/webhooks/socotra", content=body, headers=headers)


@pytest.fixture(autouse=True)
def no_tolerance(monkeypatch):
    monkeypatch.delenv("SOCOTRA_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_accepts_valid_signature(caplog):
    caplog.set_level(logging.INFO, logger="socotra-webhooks")
    body = event("policy.quote.issue")
    response = send(body, sign(body)[2])
    assert response.status_code == 200
    assert response.json() == {"received": True}
    assert "Quote issued" in caplog.text


def test_accepts_when_any_v1_matches():
    body = event("policy.account.create")
    t, v1, _ = sign(body)
    bad = "a" * 64
    assert send(body, f"t={t},v1={bad},v1={v1}").status_code == 200
    assert send(body, f"t={t},v1={v1},v1={bad}").status_code == 200


def test_ignores_other_keys():
    body = event("policy.account.create")
    t, v1, _ = sign(body)
    assert send(body, f"v0={'b' * 64},t={t},v1={v1}").status_code == 200


def test_accepts_uppercase_hex():
    body = event("policy.quote.accept")
    t, v1, _ = sign(body)
    assert send(body, f"t={t},v1={v1.upper()}").status_code == 200


def test_uses_t_string_exactly_as_sent():
    body = event("document.ready")
    assert send(body, sign(body, t="0001695835536124")[2]).status_code == 200


def test_verifies_exact_raw_bytes():
    body = '{ "type" : "policy.quote.issue",   "data": {"a":  1} }\n'
    assert send(body, sign(body)[2]).status_code == 200


def test_verifies_non_utf8_bytes():
    body = bytes([0x7B, 0xFF, 0xFE, 0x7D])
    response = send(body, sign(body)[2])
    assert response.status_code == 400  # authentic, but not JSON


def test_rejects_missing_or_empty_header():
    body = event("policy.quote.issue")
    assert send(body).status_code == 401
    assert send(body, "").status_code == 401


def test_rejects_header_without_t_or_v1():
    body = event("policy.quote.issue")
    assert send(body, f"v1={sign(body)[1]}").status_code == 401
    assert send(body, "t=1695835536124").status_code == 401


@pytest.mark.parametrize(
    "mutate",
    [lambda v: v[:62], lambda v: v + "00", lambda v: "z" * 64, lambda v: v[:62] + "zz"],
)
def test_rejects_malformed_signatures(mutate):
    body = event("policy.quote.issue")
    t, v1, _ = sign(body)
    assert send(body, f"t={t},v1={mutate(v1)}").status_code == 401


def test_rejects_tampered_body():
    header = sign(event("policy.quote.issue"))[2]
    assert send(event("policy.quote.refuse"), header).status_code == 401


def test_rejects_wrong_secret():
    body = event("policy.quote.issue")
    assert send(body, sign(body, secret="some_other_secret_99")[2]).status_code == 401


def test_rejects_tagged_endpoint():
    # A tagged endpoint signs {t}.{body}.{tag}: leave the tag unset.
    body = event("policy.quote.issue")
    assert send(body, sign(body, tag="secret-1")[2]).status_code == 401


def test_rejects_changed_t():
    body = event("policy.quote.issue")
    _, v1, _ = sign(body, t="1695835536124")
    assert send(body, f"t=1695835536125,v1={v1}").status_code == 401


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_accepts_methods(method, caplog):
    caplog.set_level(logging.INFO, logger="socotra-webhooks")
    body = event("billing.invoice.generate")
    assert send(body, sign(body)[2], method).status_code == 200
    assert "Invoice generated" in caplog.text


def test_bodyless_get_verified_over_zero_bytes():
    response = client.get("/webhooks/socotra", headers={"socotra-signature": sign("")[2]})
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_unsigned_get_rejected():
    assert client.get("/webhooks/socotra").status_code == 401


def test_authentic_non_json_is_400():
    body = "not json"
    assert send(body, sign(body)[2]).status_code == 400


def test_unknown_event_type_logged_and_200(caplog):
    caplog.set_level(logging.INFO, logger="socotra-webhooks")
    body = event("custom.my.thing")
    assert send(body, sign(body)[2]).status_code == 200
    assert "Unhandled event type: custom.my.thing" in caplog.text


class TestTolerance:
    @staticmethod
    def old():
        return str(int(time.time() * 1000) - 60 * 60 * 1000)

    def test_off_by_default(self):
        body = event("policy.quote.issue")
        assert send(body, sign(body, t=self.old())[2]).status_code == 200

    def test_rejects_old_when_enabled(self, monkeypatch):
        monkeypatch.setenv("SOCOTRA_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("policy.quote.issue")
        assert send(body, sign(body, t=self.old())[2]).status_code == 401

    def test_accepts_fresh_when_enabled(self, monkeypatch):
        monkeypatch.setenv("SOCOTRA_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = event("policy.quote.issue")
        assert send(body, sign(body)[2]).status_code == 200

    def test_zero_is_off(self, monkeypatch):
        monkeypatch.setenv("SOCOTRA_WEBHOOK_TOLERANCE_SECONDS", "0")
        body = event("policy.quote.issue")
        assert send(body, sign(body, t=self.old())[2]).status_code == 200


def test_verify_function_without_secret_or_header():
    assert verify_socotra_signature(b"{}", sign(b"{}")[2], "") is False
    assert verify_socotra_signature(b"{}", None, SECRET) is False
