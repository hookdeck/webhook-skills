import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app

# Printify secrets are arbitrary strings (e.g. `openssl rand -hex 20`),
# used as-is (UTF-8) as the HMAC key.
TEST_SECRET = "7afa37fd47d7a52ea644382e04962a83c16aef62"

client = TestClient(app)


def sign(payload: str, secret: str = TEST_SECRET) -> str:
    """X-Pfy-Signature: sha256=<hex HMAC-SHA256 of the raw body>."""
    return "sha256=" + hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def envelope(event_type: str, data: dict = None) -> str:
    return json.dumps({
        "id": "653b6be8-2ff7-4ab5-a7a6-6889a8b3bbf5",
        "type": event_type,
        "created_at": "2017-04-18 13:24:28+00:00",
        "resource": {
            "id": "5cb87a8cd490a2ccb256cec4",
            "type": event_type.split(":")[0],
            "data": data or {},
        },
    })


def post(payload: str, signature: str = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["X-Pfy-Signature"] = signature
    return client.post("/webhooks/printify", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("PRINTIFY_WEBHOOK_SECRET", TEST_SECRET)


def test_accepts_valid_signature():
    payload = envelope("order:created")
    res = post(payload, sign(payload))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "order:created"}


def test_verifies_regardless_of_content_type():
    payload = envelope("order:created")
    assert post(payload, sign(payload), "text/plain").status_code == 200


def test_rejects_missing_signature():
    assert post(envelope("order:created")).status_code == 400


def test_rejects_invalid_signature():
    payload = envelope("order:created")
    res = post(payload, sign(payload, "wrong_secret"))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid signature"


def test_rejects_tampered_body():
    payload = envelope("order:created")
    res = post(payload.replace("order:created", "order:updated"), sign(payload))
    assert res.status_code == 400


def test_rejects_signature_without_prefix():
    payload = envelope("order:created")
    assert post(payload, sign(payload).replace("sha256=", "")).status_code == 400


def test_rejects_signature_of_wrong_length():
    assert post(envelope("order:created"), "sha256=abc123").status_code == 400


def test_rejects_invalid_json_with_valid_signature():
    payload = "not json"
    res = post(payload, sign(payload))
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid JSON payload"


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("PRINTIFY_WEBHOOK_SECRET")
    payload = envelope("order:created")
    assert post(payload, sign(payload)).status_code == 500


@pytest.mark.parametrize("event_type,data", [
    ("order:created", {}),
    ("order:updated", {"shop_id": 815256, "status": "in-production"}),
    ("order:line-item:canceled", {"shop_id": 815256, "line_item_id": "abc", "status": "canceled", "status_details": "out_of_stock"}),
    ("order:sent-to-production", {}),
    ("order:shipment:created", {"shop_id": 815256, "carrier": {"code": "USPS", "tracking_number": "9400"}}),
    ("order:shipment:delivered", {"shop_id": 815256, "delivered_at": "2017-04-18 13:24:28+00:00"}),
    ("product:created", {"shop_id": 815256}),
    ("product:updated", {"shop_id": 815256}),
    ("product:publish:started", {"shop_id": 815256, "action": "create"}),
    ("product:deleted", {"shop_id": 815256}),
    ("shop:disconnected", {}),
    ("personalization-preview-task:processed", {"task_id": "t1", "status": "completed"}),
])
def test_accepts_event(event_type, data):
    payload = envelope(event_type, data)
    res = post(payload, sign(payload))
    assert res.status_code == 200
    assert res.json()["type"] == event_type


def test_acknowledges_unknown_events():
    payload = envelope("order:future-event")
    assert post(payload, sign(payload)).status_code == 200
