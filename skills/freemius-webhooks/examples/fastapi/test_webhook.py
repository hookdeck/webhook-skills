import hashlib
import hmac
import json
import logging

import pytest
from fastapi.testclient import TestClient

SECRET = "sk_test_freemius_product_secret_key"


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("FREEMIUS_WEBHOOK_SECRET", SECRET)


from main import app, verify_freemius_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Freemius: bare hex HMAC-SHA256 of the raw body, key = secret as UTF-8."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body, signature=None, content_type="application/json"):
    if isinstance(body, str):
        body = body.encode()
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-signature"] = signature
    return client.post("/webhooks/freemius", content=body, headers=headers)


@pytest.mark.parametrize(
    "event_type",
    [
        "license.activated",
        "license.created",
        "license.cancelled",
        "subscription.created",
        "subscription.cancelled",
        "payment.created",
        "payment.refund",
        "user.created",
    ],
)
def test_accepts_validly_signed_event(event_type):
    body = json.dumps({"id": 42, "type": event_type, "objects": {"license": {"id": 7}}}).encode()
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_acknowledges_unhandled_event_types(caplog):
    body = json.dumps({"id": 1, "type": "affiliate.approved"}).encode()
    with caplog.at_level(logging.INFO, logger="freemius-webhooks"):
        res = post(body, sign(body))
    assert res.status_code == 200
    assert "Unhandled Freemius event type: affiliate.approved" in caplog.text


def test_verifies_exact_bytes_not_reserialised_json():
    body = b'{ "type" :  "license.activated",\n  "id": 1 }'
    assert post(body, sign(body)).status_code == 200
    assert post(body, sign(json.dumps(json.loads(body)).encode())).status_code == 401


def test_verifies_non_ascii_body_as_bytes():
    body = json.dumps({"type": "user.created", "id": 1, "name": "Zoë 日本語"}, ensure_ascii=False).encode()
    assert post(body, sign(body)).status_code == 200


def test_works_with_any_content_type():
    body = b'{"type":"license.activated","id":1}'
    assert post(body, sign(body), content_type="text/plain").status_code == 200


def test_accepts_uppercase_hex():
    body = b'{"type":"license.activated","id":1}'
    assert post(body, sign(body).upper()).status_code == 200


BODY = b'{"type":"license.activated","id":1}'
GOOD = sign(BODY)


@pytest.mark.parametrize(
    "body, signature",
    [
        (BODY, None),
        (BODY, ""),
        (BODY, sign(BODY, "other_secret")),
        (BODY.replace(b"1", b"2"), GOOD),
        (BODY, GOOD[:62]),
        (BODY, f"sha256={GOOD}"),
        (BODY, GOOD[:63] + "z"),
        (b"", GOOD),
    ],
    ids=["missing", "empty", "wrong-secret", "tampered", "truncated", "prefixed", "non-hex", "empty-body"],
)
def test_rejects_bad_signature_with_401(body, signature):
    assert post(body, signature).status_code == 401


def test_non_ascii_signature_header_is_rejected_not_500():
    res = client.post(
        "/webhooks/freemius",
        content=BODY,
        headers={"content-type": "application/json", "x-signature": "é".encode("latin-1")},
    )
    assert res.status_code == 401


@pytest.mark.parametrize("body", [b"not json", b"null", b"42", b'"text"', b"[]", b"{}", b'{"type":5}'])
def test_returns_400_for_valid_signature_but_unusable_body(body):
    assert post(body, sign(body)).status_code == 400


@pytest.mark.parametrize(
    "extra",
    [{"objects": "x"}, {"objects": None}, {"objects": [1]}, {"id": {"a": 1}}, {"id": True}],
)
def test_ignores_wrong_typed_nested_fields(extra):
    body = json.dumps({"type": "license.activated", **extra}).encode()
    assert post(body, sign(body)).status_code == 200


def test_returns_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("FREEMIUS_WEBHOOK_SECRET")
    assert post(BODY, GOOD).status_code == 500


def test_verify_rejects_none():
    assert verify_freemius_signature(b"x", None, SECRET) is False
