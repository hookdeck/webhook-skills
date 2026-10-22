import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

SECRET = "secretkey"


@pytest.fixture(autouse=True)
def set_secret(monkeypatch):
    monkeypatch.setenv("SENDCLOUD_WEBHOOK_SECRET", SECRET)


from main import app, verify_sendcloud_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["sendcloud-signature"] = signature
    return client.post("/webhooks/sendcloud", content=body, headers=headers)


EVENTS = [
    {"action": "parcel_status_changed", "timestamp": 1, "parcel": {"id": 1, "status": {"id": 1, "message": "Ready to send"}}},
    {"action": "return_created", "timestamp": 1, "data": {"id": 42, "order_number": "ORD1"}},
    {"action": "integration_connected", "timestamp": 1, "integration": {"id": 1}},
    {"action": "integration_updated", "timestamp": 1, "integration": {"id": 1}},
    {"action": "integration_deleted", "timestamp": 1, "integration": {"id": 1}},
]


def test_documented_test_vector():
    expected = "1eed4b3d41f4653ac64fd56f1bf1cbfd349e4482cbc11dff7134bd93e5da4b0a"
    assert sign(b'{"key": "value"}') == expected
    assert verify_sendcloud_signature(b'{"key": "value"}', expected, "secretkey")


@pytest.mark.parametrize("event", EVENTS, ids=[e["action"] for e in EVENTS])
def test_valid_events(event):
    body = json.dumps(event).encode()
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_any_content_type():
    body = json.dumps(EVENTS[0]).encode()
    assert post(body, sign(body), "text/plain").status_code == 200


def test_exact_bytes_with_unusual_whitespace():
    body = b'{"action":  "parcel_status_changed",\n "timestamp": 1}'
    assert post(body, sign(body)).status_code == 200


def test_unknown_action_accepted():
    body = b'{"action": "something_new"}'
    assert post(body, sign(body)).status_code == 200


def test_invalid_signature():
    body = json.dumps(EVENTS[0]).encode()
    assert post(body, "a" * 64).status_code == 400


def test_wrong_length_signature():
    body = json.dumps(EVENTS[0]).encode()
    assert post(body, "abc").status_code == 400


def test_other_secret():
    body = json.dumps(EVENTS[0]).encode()
    assert post(body, sign(body, "other")).status_code == 400


def test_tampered_body():
    body = json.dumps(EVENTS[0]).encode()
    assert post(body.replace(b"1", b"2"), sign(body)).status_code == 400


def test_missing_signature():
    body = json.dumps(EVENTS[0]).encode()
    assert post(body).status_code == 400


def test_signed_invalid_json():
    body = b"not json"
    assert post(body, sign(body), "text/plain").status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("SENDCLOUD_WEBHOOK_SECRET")
    body = json.dumps(EVENTS[0]).encode()
    assert post(body, sign(body)).status_code == 500
