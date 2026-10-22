import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Increase shared secrets are arbitrary 1-100 character strings used as raw UTF-8 bytes
SECRET = "test_shared_secret_n8Kd2pQx"
os.environ["INCREASE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(webhook_id: str, timestamp: int, body: str, secret=SECRET) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode()
    digest = hmac.new(key, f"{webhook_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def headers_for(body: str, webhook_id="event_123abc", timestamp=None, secret=SECRET) -> dict:
    ts = int(time.time()) if timestamp is None else timestamp
    return {
        "webhook-id": webhook_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": sign(webhook_id, ts, body, secret),
    }


def post(body: str, headers: dict, content_type="application/json"):
    return client.post(
        "/webhooks/increase",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


CREATED = json.dumps({
    "id": "event_123abc",
    "created_at": "2020-01-31T23:59:59Z",
    "category": "transaction.created",
    "associated_object_type": "transaction",
    "associated_object_id": "transaction_abc123",
    "type": "event",
})


def test_accepts_valid_signature():
    res = post(CREATED, headers_for(CREATED))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_verifies_any_content_type():
    res = post(CREATED, headers_for(CREATED), content_type="text/plain")
    assert res.status_code == 200


def test_uses_secret_as_raw_bytes(monkeypatch):
    b64_looking = "dGVzdF9zZWNyZXRfa2V5"
    monkeypatch.setenv("INCREASE_WEBHOOK_SECRET", b64_looking)
    assert post(CREATED, headers_for(CREATED, secret=b64_looking)).status_code == 200
    decoded = base64.b64decode(b64_looking)
    assert post(CREATED, headers_for(CREATED, secret=decoded)).status_code == 400


def test_accepts_when_any_of_several_signatures_matches():
    h = headers_for(CREATED)
    h["webhook-signature"] = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= " + h["webhook-signature"]
    assert post(CREATED, h).status_code == 200


def test_rejects_tampered_body():
    tampered = CREATED.replace("transaction.created", "account.created")
    assert post(tampered, headers_for(CREATED)).status_code == 400


def test_rejects_wrong_secret():
    assert post(CREATED, headers_for(CREATED, secret="other_secret")).status_code == 400


def test_rejects_signature_for_different_webhook_id():
    h = headers_for(CREATED)
    h["webhook-id"] = "event_other"
    assert post(CREATED, h).status_code == 400


def test_rejects_malformed_signature_without_raising():
    h = headers_for(CREATED)
    h["webhook-signature"] = "v1,short"
    assert post(CREATED, h).status_code == 400


def test_rejects_missing_headers():
    assert post(CREATED, {}).status_code == 400


def test_rejects_non_integer_timestamp():
    h = headers_for(CREATED)
    h["webhook-timestamp"] = "yesterday"
    assert post(CREATED, h).status_code == 400


def test_accepts_old_timestamp_by_default():
    old = int(time.time()) - 3600
    assert post(CREATED, headers_for(CREATED, timestamp=old)).status_code == 200


def test_rejects_old_timestamp_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("INCREASE_TIMESTAMP_TOLERANCE_SECONDS", "300")
    old = int(time.time()) - 3600
    assert post(CREATED, headers_for(CREATED, timestamp=old)).status_code == 400
    assert post(CREATED, headers_for(CREATED)).status_code == 200


def test_rejects_invalid_json_that_is_signed():
    body = "not json"
    assert post(body, headers_for(body)).status_code == 400


def test_acknowledges_unhandled_category():
    body = json.dumps({"id": "event_9", "category": "card_dispute.updated", "type": "event"})
    assert post(body, headers_for(body, webhook_id="event_9")).status_code == 200


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("INCREASE_WEBHOOK_SECRET")
    assert post(CREATED, headers_for(CREATED)).status_code == 500
