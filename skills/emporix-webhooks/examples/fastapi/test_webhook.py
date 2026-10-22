import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm Svix uses: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         query: str = "", content_type: str = "application/json"):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        f"/webhooks/emporix{query}",
        content=payload,
        headers={
            "content-type": content_type,
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("EMPORIX_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    "event_type,data",
    [
        ("order.created", {"id": "ord1", "status": "CREATED"}),
        ("order.updated", {"id": "ord1", "status": "CONFIRMED"}),
        ("customer.created", {"customerNumber": "CUS1", "contactEmail": "a@example.com"}),
        ("product.created", {"id": "p1", "code": "SKU-1"}),
        ("product.updated", {"id": "p1", "code": "SKU-1"}),
    ],
)
def test_handles_event_identified_by_query_parameter(event_type, data):
    response = send(json.dumps(data), query=f"?eventType={event_type}")
    assert response.status_code == 200
    assert response.json() == {"success": True, "eventType": event_type}


def test_prefers_event_type_field_in_body():
    response = send(json.dumps({"eventType": "order.created", "id": "ord1"}))
    assert response.status_code == 200
    assert response.json()["eventType"] == "order.created"


def test_accepts_body_with_no_event_type():
    response = send(json.dumps({"id": "ord1"}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "eventType": None}


def test_handles_unknown_event_type():
    response = send('{"id":"x"}', query="?eventType=something.new")
    assert response.status_code == 200
    assert response.json()["eventType"] == "something.new"


def test_verifies_any_content_type():
    response = send('{"id":"ord1"}', content_type="application/cloudevents+json")
    assert response.status_code == 200


def test_accepts_any_matching_signature_among_several():
    payload = '{"id":"ord1"}'
    timestamp = now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, 'msg_rotation', timestamp)}"
    response = send(payload, msg_id="msg_rotation", timestamp=timestamp, signature=signature)
    assert response.status_code == 200


def test_rejects_missing_headers():
    response = client.post("/webhooks/emporix", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_rejects_invalid_signature():
    response = send('{"id":"ord1"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_signature_from_different_secret():
    payload = '{"id":"ord1"}'
    timestamp = now()
    signature = sign(payload, "msg_other", timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    response = send(payload, msg_id="msg_other", timestamp=timestamp, signature=signature)
    assert response.status_code == 400


def test_rejects_tampered_body():
    timestamp = now()
    signature = sign('{"id":"ord1"}', "msg_tamper", timestamp)
    response = send('{"id":"ord2"}', msg_id="msg_tamper", timestamp=timestamp, signature=signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_rejects_timestamp_older_than_5_minutes():
    response = send('{"id":"ord1"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("EMPORIX_WEBHOOK_SECRET")
    response = send('{"id":"ord1"}')
    assert response.status_code == 500
