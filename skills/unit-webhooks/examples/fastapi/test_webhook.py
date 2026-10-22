import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

TOKEN = "test_unit_webhook_token"
os.environ["UNIT_WEBHOOK_TOKEN"] = TOKEN

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, token: str = TOKEN) -> str:
    # Matches Unit: base64 HMAC-SHA1 of the raw body, keyed by the webhook token.
    return base64.b64encode(hmac.new(token.encode(), body, hashlib.sha1).digest()).decode()


def event_body(event_type: str, event_id: str = "269") -> bytes:
    return json.dumps(
        {
            "data": [
                {
                    "id": event_id,
                    "type": event_type,
                    "attributes": {"createdAt": "2021-04-13T07:40:43.813Z"},
                    "relationships": {"account": {"data": {"id": "10004", "type": "account"}}},
                }
            ]
        }
    ).encode()


def post(body: bytes, signature: str | None, content_type: str = "application/vnd.api+json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-unit-signature"] = signature
    return client.post("/webhooks/unit", content=body, headers=headers)


@pytest.mark.parametrize(
    "event_type",
    [
        "account.created",
        "customer.created",
        "transaction.created",
        "payment.clearing",
        "application.approved",
    ],
)
def test_valid_events(event_type):
    body = event_body(event_type)
    response = post(body, sign(body))
    assert response.status_code == 200
    assert response.json() == {"received": True}


@pytest.mark.parametrize("content_type", ["application/json", "text/plain"])
def test_any_content_type_verifies(content_type):
    body = event_body("account.created")
    assert post(body, sign(body), content_type).status_code == 200


def test_batched_delivery():
    body = json.dumps(
        {
            "data": [
                {"id": "1", "type": "customer.created", "attributes": {}, "relationships": {}},
                {"id": "2", "type": "account.created", "attributes": {}, "relationships": {}},
            ]
        }
    ).encode()
    assert post(body, sign(body)).status_code == 200


def test_unknown_event_type_accepted():
    body = event_body("somethingNew.happened")
    assert post(body, sign(body)).status_code == 200


def test_invalid_signature():
    body = event_body("account.created")
    assert post(body, sign(body, "wrong_token")).status_code == 400


def test_signature_with_different_length():
    body = event_body("account.created")
    assert post(body, "short").status_code == 400


def test_missing_signature():
    body = event_body("account.created")
    assert post(body, None).status_code == 400


def test_modified_body():
    body = event_body("account.created")
    assert post(body.replace(b"269", b"999"), sign(body)).status_code == 400


def test_signed_but_malformed_json():
    body = b"{not json"
    assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
