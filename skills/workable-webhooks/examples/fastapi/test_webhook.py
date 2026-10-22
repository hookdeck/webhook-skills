import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

KEY = "test_api_token_0123456789abcdef"
os.environ["WORKABLE_SIGNING_KEY"] = KEY

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, key: str = KEY) -> str:
    return hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/workable",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


EVENTS = ["candidate_created", "candidate_moved", "employee_created", "employee_updated", "employee_published"]


@pytest.mark.parametrize("event_type", EVENTS)
def test_accepts_valid_signature(event_type):
    body = json.dumps({"id": "abc123", "event_type": event_type}).encode()
    res = post(body, {"x-workable-signature": sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_verifies_regardless_of_content_type():
    body = json.dumps({"id": "abc123", "event_type": "candidate_created"}).encode()
    res = post(body, {"content-type": "text/plain", "x-workable-signature": sign(body)})
    assert res.status_code == 200


def test_accepts_uppercase_hex_signature():
    body = json.dumps({"id": "abc123", "event_type": "candidate_created"}).encode()
    res = post(body, {"x-workable-signature": sign(body).upper()})
    assert res.status_code == 200


def test_unhandled_event_returns_200():
    body = json.dumps({"id": "abc123", "event_type": "job_deleted"}).encode()
    assert post(body, {"x-workable-signature": sign(body)}).status_code == 200


def test_rejects_wrong_key():
    body = json.dumps({"id": "abc123", "event_type": "candidate_created"}).encode()
    assert post(body, {"x-workable-signature": sign(body, "wrong")}).status_code == 400


def test_rejects_tampered_body():
    sig = sign(json.dumps({"id": "abc123", "event_type": "candidate_created"}).encode())
    tampered = json.dumps({"id": "evil", "event_type": "candidate_created"}).encode()
    assert post(tampered, {"x-workable-signature": sig}).status_code == 400


def test_rejects_malformed_signature():
    body = json.dumps({"id": "abc123"}).encode()
    assert post(body, {"x-workable-signature": "abc"}).status_code == 400


def test_rejects_missing_signature():
    assert post(json.dumps({"id": "abc123"}).encode()).status_code == 400
