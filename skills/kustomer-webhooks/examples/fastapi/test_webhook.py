import hashlib
import hmac
import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Kustomer's webhook token; any string works for tests.
SECRET = "test_kustomer_webhook_token"
os.environ["KUSTOMER_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def make_event(name: str, event_id: str | None = None) -> bytes:
    return json.dumps(
        {
            "id": event_id or f"evt_{uuid.uuid4().hex}",
            "name": name,
            "org": "5f8481c6a22ab5b9d5f2dd8a",
            "orgName": "org-name",
            "data": {"type": "customer", "id": "608732dc0ac6b300195d5fb5", "attributes": {"name": "Franz Kafka"}},
            "createdAt": "2021-04-26T21:38:36.418Z",
            "changes": None,
            "persist": True,
        }
    ).encode()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Kustomer-Webhook-Signature"] = signature
    return client.post("/webhooks/kustomer", content=body, headers=headers)


@pytest.mark.parametrize(
    "name",
    [
        "kustomer.conversation.create",
        "kustomer.conversation.update",
        "kustomer.customer.create",
        "kustomer.customer.update",
        "kustomer.message.create",
        "kustomer.message.update",
    ],
)
def test_accepts_valid_event(name):
    body = make_event(name)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json()["received"] is True


def test_accepts_unknown_event_name():
    body = make_event("kustomer.team.create")
    assert post(body, sign(body)).status_code == 200


def test_verifies_regardless_of_content_type():
    body = make_event("kustomer.customer.create")
    assert post(body, sign(body), "text/plain").status_code == 200


def test_rejects_missing_signature():
    assert post(make_event("kustomer.customer.create")).status_code == 400


def test_rejects_invalid_signature():
    body = make_event("kustomer.customer.create")
    assert post(body, sign(body, "wrong_secret")).status_code == 400


def test_rejects_wrong_length_signature():
    assert post(make_event("kustomer.customer.create"), "abc123").status_code == 400


def test_rejects_tampered_body():
    body = make_event("kustomer.customer.create")
    assert post(body.replace(b"Kafka", b"Samsa"), sign(body)).status_code == 400


def test_rejects_invalid_json_with_valid_signature():
    body = b"not json"
    assert post(body, sign(body), "text/plain").status_code == 400


def test_flags_duplicate_event_ids():
    body = make_event("kustomer.message.create", "evt_dup")
    first = post(body, sign(body)).json()
    second = post(body, sign(body)).json()
    assert "duplicate" not in first
    assert second["duplicate"] is True
