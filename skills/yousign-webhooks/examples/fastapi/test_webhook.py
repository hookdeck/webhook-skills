import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_yousign_webhook_secret"
os.environ["YOUSIGN_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def payload(event_name: str, data: dict | None = None) -> bytes:
    return json.dumps({
        "event_id": "b6c63685-c556-4a30-8fe9-b6f2b187d936",
        "event_name": event_name,
        "event_time": "1670855889",
        "subscription_id": "sub_123",
        "subscription_description": "test",
        "sandbox": True,
        "data": data or {},
    }).encode()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/yousign",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


@pytest.mark.parametrize("name,data", [
    ("signature_request.activated", {"signature_request": {"id": "sr_1"}}),
    ("signature_request.done", {"signature_request": {"id": "sr_1"}}),
    ("signature_request.declined", {"signature_request": {"id": "sr_1"}}),
    ("signer.done", {"signer": {"id": "s_1"}}),
    ("signer.declined", {"signer": {"id": "s_1"}}),
])
def test_valid_events(name, data):
    body = payload(name, data)
    res = post(body, {"X-Yousign-Signature-256": sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_any_content_type():
    body = payload("signer.done")
    res = post(body, {"content-type": "text/plain", "X-Yousign-Signature-256": sign(body)})
    assert res.status_code == 200


def test_missing_signature():
    assert post(payload("signer.done")).status_code == 400


def test_wrong_secret():
    body = payload("signer.done")
    assert post(body, {"X-Yousign-Signature-256": sign(body, "wrong")}).status_code == 400


def test_tampered_body():
    body = payload("signer.done")
    tampered = body.replace(b"sub_123", b"sub_999")
    assert post(tampered, {"X-Yousign-Signature-256": sign(body)}).status_code == 400


def test_missing_prefix():
    body = payload("signer.done")
    bare = sign(body)[len("sha256="):]
    assert post(body, {"X-Yousign-Signature-256": bare}).status_code == 400


def test_invalid_json_with_valid_signature():
    body = b"not json"
    assert post(body, {"X-Yousign-Signature-256": sign(body)}).status_code == 400
