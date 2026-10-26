import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

def completed_order(**overrides) -> str:
    """order.completion with status COMPLETED: an order summary (bare resource, no envelope)."""
    return json.dumps({
        "id": "ord_12345",
        "status": "COMPLETED",
        "created_at": "2025-08-26T18:39:20.000000+00:00",
        "completed_at": "2025-08-26T18:39:27.006833+00:00",
        "payment_method": {"type": "ACCOUNT_BALANCE", "currency": "USD"},
        "currency": "USD",
        "total_price": "10.00",
        "total_discount": "1.00",
        **overrides,
    })


def failed_order() -> str:
    """order.completion with status FAILED: only {id, status}."""
    return json.dumps({"id": "ord_67890", "status": "FAILED"})


def product_update(product_code="XYZ-US", orderable=False, timestamp="2025-08-26T18:39:27.006833+00:00") -> str:
    """product.update: {product_code, old_state, new_state, timestamp}."""
    def state(is_orderable):
        return {
            "price_multiplier": "0.0098",
            "is_orderable": is_orderable,
            "denominations": {"type": "fixed", "available_list": ["10", "25", "50"],
                              "minimum_value": "10.0", "maximum_value": "50.0"},
        }
    return json.dumps({"product_code": product_code, "old_state": state(not orderable),
                       "new_state": state(orderable), "timestamp": timestamp})


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Runa as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/runa",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("RUNA_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_order_completion_completed():
    response = send(completed_order())
    assert response.status_code == 200
    assert response.json() == {"received": True, "event": "order.completion"}


def test_order_completion_failed_stub():
    response = send(failed_order())
    assert response.status_code == 200
    assert response.json() == {"received": True, "event": "order.completion"}


def test_product_update():
    response = send(product_update(product_code="BASIC-US"))
    assert response.status_code == 200
    assert response.json() == {"received": True, "event": "product.update"}


def test_stale_product_update_is_ignored():
    code = "ORDER-US"
    newer = send(product_update(code, orderable=True, timestamp="2025-08-26T18:40:00.000000+00:00"))
    assert newer.json() == {"received": True, "event": "product.update"}
    older = send(product_update(code, orderable=False, timestamp="2025-08-26T18:39:00.000000+00:00"))
    assert older.status_code == 200
    assert older.json() == {"received": True, "event": "product.update", "ignored": "stale"}


def test_unrecognised_payload_acknowledged():
    response = send('{"hello": "world"}')
    assert response.status_code == 200
    assert response.json() == {"received": True, "event": None}


def test_any_content_type_verifies():
    response = send(completed_order(), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(completed_order(), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"received": True, "event": "order.completion"}


def test_webhook_prefixed_invalid_signature():
    response = send(completed_order(), prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = completed_order()
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = completed_order()
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/runa", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(completed_order(), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(completed_order(), signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = completed_order()
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(failed_order(), msg_id, timestamp)
    response = send(completed_order(), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(completed_order(), timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_non_json_body():
    response = send("not json")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_non_object_json_body():
    assert send("[1, 2]").status_code == 400


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("RUNA_WEBHOOK_SECRET")
    assert send(completed_order()).status_code == 500
