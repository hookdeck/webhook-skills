import hashlib
import hmac
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "k3Jx9QmVt2LwZp8RaYb5NcHd7UfGs1EoXi4TyWn6AvBq0CrMlD"  # 50-char Campfire token
os.environ["CAMPFIRE_WEBHOOK_SECRET"] = SECRET
os.environ.pop("CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, verify_campfire_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Same algorithm as Campfire: HMAC-SHA256(secret, "{timestamp}:{raw body}"), hex."""
    message = b"".join([timestamp.encode("latin-1"), b":", body])
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def now_ts() -> str:
    return str(int(time.time()))


def post(body, timestamp="auto", signature="auto", content_type="application/json"):
    if isinstance(body, str):
        body = body.encode()
    if timestamp == "auto":
        timestamp = now_ts()
    headers = {"content-type": content_type}
    if timestamp is not None:
        headers["campfire-webhook-request-timestamp"] = timestamp
    if signature == "auto":
        signature = sign(body, timestamp or "")
    if signature is not None:
        headers["campfire-webhook-signature-v1"] = signature
    return client.post("/webhooks/campfire", content=body, headers=headers)


INVOICE_PAID = (
    '{"webhook_uuid":"3c88df19-1c1f-4b1c-b4a7-768793055a60","topic":"Invoice.paid",'
    '"data":{"id":12345,"invoice_number":"INV-1042","payment_status":"paid","amount_paid":1500.0},'
    '"changes":{"payment_status":{"old":"open","new":"paid"}}}'
)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_accepts_valid_signature_and_handles_invoice_paid(capsys):
    res = post(INVOICE_PAID)
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "Invoice paid: 12345" in capsys.readouterr().out


@pytest.mark.parametrize(
    "topic,line",
    [
        ("Invoice.created", "Invoice created: 7 (INV-7)"),
        ("Bill.created", "Bill created: 7"),
        ("Contract.updated", "Unhandled Campfire topic: Contract.updated"),
    ],
)
def test_handles_common_topics_and_logs_unknown(capsys, topic, line):
    body = f'{{"webhook_uuid":"u","topic":"{topic}","data":{{"id":7,"invoice_number":"INV-7"}},"changes":null}}'
    assert post(body).status_code == 200
    assert line in capsys.readouterr().out


def test_handles_deleted_payload_with_only_an_id(capsys):
    body = '{"webhook_uuid":"u","topic":"Bill.deleted","data":{"id":99},"changes":null}'
    assert post(body).status_code == 200
    assert "Bill.deleted: 99" in capsys.readouterr().out


def test_verifies_exact_bytes_whatever_the_content_type():
    assert post(INVOICE_PAID, content_type="text/plain").status_code == 200


def test_verifies_body_with_unusual_whitespace_untouched():
    body = '{ "topic" :"Invoice.paid",\n "data":{"id":1},  "changes":null }'
    assert post(body).status_code == 200


def test_accepts_uppercase_hex():
    ts = now_ts()
    assert post(INVOICE_PAID, ts, sign(INVOICE_PAID.encode(), ts).upper()).status_code == 200


def test_rejects_missing_or_empty_signature():
    assert post(INVOICE_PAID, signature=None).status_code == 401
    assert post(INVOICE_PAID, signature="").status_code == 401


def test_rejects_missing_or_empty_timestamp():
    sig = sign(INVOICE_PAID.encode(), "1770000000")
    assert post(INVOICE_PAID, timestamp=None, signature=sig).status_code == 401
    assert post(INVOICE_PAID, timestamp="", signature=sig).status_code == 401


def test_rejects_wrong_secret():
    ts = now_ts()
    assert post(INVOICE_PAID, ts, sign(INVOICE_PAID.encode(), ts, "x" * 50)).status_code == 401


def test_rejects_tampered_body():
    ts = now_ts()
    sig = sign(INVOICE_PAID.encode(), ts)
    assert post(INVOICE_PAID.replace("1500", "1"), ts, sig).status_code == 401


def test_rejects_timestamp_that_was_not_signed():
    assert post(INVOICE_PAID, now_ts(), sign(INVOICE_PAID.encode(), "1770000000")).status_code == 401


def test_rejects_dot_joined_message():
    ts = now_ts()
    dot_sig = hmac.new(SECRET.encode(), f"{ts}.{INVOICE_PAID}".encode(), hashlib.sha256).hexdigest()
    assert post(INVOICE_PAID, ts, dot_sig).status_code == 401


def test_rejects_prefixed_truncated_nonhex_and_overlong_signatures():
    ts = now_ts()
    good = sign(INVOICE_PAID.encode(), ts)
    for bad in (f"sha256={good}", good[:62], good + "aa", "z" * 64, good[:63] + "g"):
        assert post(INVOICE_PAID, ts, bad).status_code == 401


def test_returns_400_for_signed_non_json_body():
    assert post("not json").status_code == 400


def test_does_not_reject_old_timestamps_by_default():
    assert post(INVOICE_PAID, timestamp="1770000000").status_code == 200


def test_rejects_old_timestamps_when_tolerance_is_set(monkeypatch):
    monkeypatch.setenv("CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS", "300")
    assert post(INVOICE_PAID, timestamp="1770000000").status_code == 401
    assert post(INVOICE_PAID).status_code == 200


def test_verifier_rejects_missing_secret():
    ts = now_ts()
    body = INVOICE_PAID.encode()
    assert verify_campfire_signature(body, ts, sign(body, ts), SECRET) is True
    assert verify_campfire_signature(body, ts, sign(body, ts), "") is False
