import hashlib
import hmac
import json
import uuid

import pytest
from fastapi.testclient import TestClient

SECRET = "test_dwolla_subscription_secret"

import os

os.environ["DWOLLA_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Dwolla: hex HMAC-SHA256 of the raw body, keyed with the subscription secret."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def make_event(**overrides) -> bytes:
    event = {
        "id": str(uuid.uuid4()),
        "resourceId": "36E9DCB2-889B-4873-8E52-0C9404EA002A",
        "topic": "customer_created",
        "timestamp": "2015-10-22T14:44:11.407Z",
        "_links": {"self": {"href": "https://api-sandbox.dwolla.com/events/x"}},
    }
    event.update(overrides)
    return json.dumps(event).encode()


def post(body: bytes, signature: str | None = None):
    headers = {"Content-Type": "application/vnd.dwolla.v1.hal+json"}
    if signature is not None:
        headers["X-Request-Signature-SHA-256"] = signature
    return client.post("/webhooks/dwolla", content=body, headers=headers)


def test_valid_signature():
    body = make_event()
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json()["received"] is True


@pytest.mark.parametrize(
    "topic",
    [
        "customer_verified",
        "customer_funding_source_added",
        "customer_funding_source_verified",
        "customer_transfer_created",
        "customer_transfer_completed",
        "customer_transfer_failed",
        "customer_bank_transfer_completed",
        "some_unknown_topic",
    ],
)
def test_handles_topics(topic):
    body = make_event(topic=topic)
    assert post(body, sign(body)).status_code == 200


def test_invalid_signature():
    assert post(make_event(), "a" * 64).status_code == 400


def test_wrong_secret():
    body = make_event()
    assert post(body, sign(body, "wrong_secret")).status_code == 400


def test_missing_signature():
    assert post(make_event()).status_code == 400


def test_signature_different_length():
    assert post(make_event(), "short").status_code == 400


def test_tampered_body():
    body = make_event()
    tampered = body.replace(b"customer_created", b"customer_verified")
    assert post(tampered, sign(body)).status_code == 400


def test_raw_body_not_reencoded():
    body = b'{ "id":"evt-raw-1",  "topic":"customer_created", "resourceId":"r1" }'
    assert post(body, sign(body)).status_code == 200


def test_duplicate_event_returns_200():
    body = make_event()
    sig = sign(body)
    post(body, sig)
    res = post(body, sig)
    assert res.status_code == 200
    assert res.json()["duplicate"] is True


def test_non_json_body():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400
