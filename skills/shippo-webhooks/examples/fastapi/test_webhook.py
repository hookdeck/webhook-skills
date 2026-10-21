import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Shippo HMAC secrets are opaque strings provisioned by Shippo's solutions team.
# The secret is used as-is (UTF-8) as the HMAC key; it is NOT base64-decoded.
TEST_SECRET = "test_shippo_hmac_secret"
TEST_TOKEN = "test_url_token_123abc"

client = TestClient(app)


def generate_signature(payload: str, secret: str, timestamp: int = None) -> str:
    """Build a Shippo-Auth-Signature header: t=<ts>,v1=hex(HMAC-SHA256(secret, "<ts>.<body>"))."""
    if timestamp is None:
        timestamp = int(time.time())
    signature = hmac.new(
        secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


TRACK_PAYLOAD = json.dumps({
    "event": "track_updated",
    "test": True,
    "data": {
        "carrier": "usps",
        "tracking_number": "9205590164917312751089",
        "tracking_status": {"status": "DELIVERED", "status_date": "2016-07-23T00:00:00Z"},
    },
})


def post(payload: str, signature: str = None, query: str = ""):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["Shippo-Auth-Signature"] = signature
    return client.post(f"/webhooks/shippo{query}", content=payload, headers=headers)


@pytest.fixture
def hmac_mode(monkeypatch):
    monkeypatch.setenv("SHIPPO_WEBHOOK_SECRET", TEST_SECRET)
    monkeypatch.delenv("SHIPPO_WEBHOOK_TOKEN", raising=False)


@pytest.fixture
def token_mode(monkeypatch):
    monkeypatch.delenv("SHIPPO_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("SHIPPO_WEBHOOK_TOKEN", TEST_TOKEN)


class TestHmacMode:
    def test_valid_signature(self, hmac_mode):
        response = post(TRACK_PAYLOAD, generate_signature(TRACK_PAYLOAD, TEST_SECRET))
        assert response.status_code == 200
        assert response.json() == {"received": True, "event": "track_updated"}

    def test_missing_signature(self, hmac_mode):
        response = post(TRACK_PAYLOAD)
        assert response.status_code == 400
        assert response.json()["detail"] == "Missing Shippo-Auth-Signature header"

    def test_wrong_secret(self, hmac_mode):
        response = post(TRACK_PAYLOAD, generate_signature(TRACK_PAYLOAD, "wrong_secret"))
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_tampered_body(self, hmac_mode):
        signature = generate_signature(TRACK_PAYLOAD, TEST_SECRET)
        response = post(TRACK_PAYLOAD.replace("DELIVERED", "RETURNED"), signature)
        assert response.status_code == 400

    def test_old_timestamp_accepted_by_default(self, hmac_mode, monkeypatch):
        # Retries and replays keep the original timestamp, so the window is off by default
        monkeypatch.delenv("SHIPPO_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 86400
        response = post(TRACK_PAYLOAD, generate_signature(TRACK_PAYLOAD, TEST_SECRET, old))
        assert response.status_code == 200

    def test_non_numeric_window_treated_as_zero(self, hmac_mode, monkeypatch):
        monkeypatch.setenv("SHIPPO_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 86400
        response = post(TRACK_PAYLOAD, generate_signature(TRACK_PAYLOAD, TEST_SECRET, old))
        assert response.status_code == 200

    def test_old_timestamp_rejected_when_window_set(self, hmac_mode, monkeypatch):
        monkeypatch.setenv("SHIPPO_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 600
        response = post(TRACK_PAYLOAD, generate_signature(TRACK_PAYLOAD, TEST_SECRET, old))
        assert response.status_code == 400
        assert response.json()["detail"] == "Timestamp outside tolerance"

    def test_malformed_header(self, hmac_mode):
        response = post(TRACK_PAYLOAD, "garbage")
        assert response.status_code == 400
        assert response.json()["detail"] == "Malformed Shippo-Auth-Signature header"

    def test_multiple_v1_signatures(self, hmac_mode):
        ts = int(time.time())
        good = generate_signature(TRACK_PAYLOAD, TEST_SECRET, ts).split("v1=")[1]
        response = post(TRACK_PAYLOAD, f"t={ts},v1={'0' * 64},v1={good}")
        assert response.status_code == 200

    def test_invalid_json(self, hmac_mode):
        response = post("not json", generate_signature("not json", TEST_SECRET))
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON payload"

    @pytest.mark.parametrize("event,data", [
        ("track_updated", {"tracking_number": "123", "tracking_status": {"status": "TRANSIT"}}),
        ("transaction_created", {"object_id": "abc", "status": "SUCCESS", "tracking_number": "9499"}),
        ("transaction_updated", {"object_id": "abc", "status": "REFUNDED"}),
        ("batch_created", "batch # created"),
        ("batch_purchased", "batch # processing complete"),
        ("automations_label_resolved", {"request_id": "b3b8f6b0", "status": "purchased"}),
        ("some_future_event", {}),
    ])
    def test_event_types(self, hmac_mode, event, data):
        payload = json.dumps({"event": event, "test": True, "data": data})
        response = post(payload, generate_signature(payload, TEST_SECRET))
        assert response.status_code == 200
        assert response.json()["event"] == event


class TestTokenMode:
    def test_correct_token(self, token_mode):
        assert post(TRACK_PAYLOAD, query=f"?token={TEST_TOKEN}").status_code == 200

    def test_wrong_token(self, token_mode):
        response = post(TRACK_PAYLOAD, query="?token=nope")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid token"

    def test_missing_token(self, token_mode):
        assert post(TRACK_PAYLOAD).status_code == 400


def test_hmac_and_token_both_required(monkeypatch):
    monkeypatch.setenv("SHIPPO_WEBHOOK_SECRET", TEST_SECRET)
    monkeypatch.setenv("SHIPPO_WEBHOOK_TOKEN", TEST_TOKEN)
    signature = generate_signature(TRACK_PAYLOAD, TEST_SECRET)
    assert post(TRACK_PAYLOAD, signature, f"?token={TEST_TOKEN}").status_code == 200
    assert post(TRACK_PAYLOAD, signature, "?token=nope").status_code == 400
    assert post(TRACK_PAYLOAD, query=f"?token={TEST_TOKEN}").status_code == 400


def test_unconfigured_returns_500(monkeypatch):
    monkeypatch.delenv("SHIPPO_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("SHIPPO_WEBHOOK_TOKEN", raising=False)
    assert post(TRACK_PAYLOAD).status_code == 500


def test_health():
    assert client.get("/health").status_code == 200
