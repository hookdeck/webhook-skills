# Generated with: cloudflare-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Cloudflare FastAPI webhook receiver.

Cloudflare has no signature: the "real credential" a test can generate is the
exact secret Cloudflare echoes back in the cf-webhook-auth header.
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app, event_name, verify_cloudflare_auth

client = TestClient(app)

SECRET = "cf_test_secret_3b9d41c8a7e2"

# From Cloudflare's webhook payload schema reference.
L7_DDOS = {
    "account_id": "9035f53656c247e895c5a6939ae8a0e0",
    "alert_correlation_id": "000eaa907ed24e78946d3a93adb2ae57",
    "alert_event": "ALERT_STATE_EVENT_START",
    "alert_type": "advanced_ddos_attack_l7_alert",
    "data": {"target_hostname": "example.com", "attack_id": "abc", "requests_per_second": 1000},
    "name": "Example Cloudflare Notification",
    "policy_id": "749b911ea5d04344a58e45edd099b328",
    "policy_name": "Example Cloudflare Notification",
    "text": "The description of my Cloudflare notification.",
    "ts": 1136214245,
}
HEALTH_CHECK = {
    **L7_DDOS,
    "alert_type": "health_check_status_notification",
    "data": {"health_check_name": "origin", "old_status": "Healthy", "new_status": "Unhealthy"},
}
# The "Save and Test" message has only `text`.
TEST_MESSAGE = {
    "text": "Hello World! This is a test message sent from https://cloudflare.com. "
    "If you can see this, your webhook is configured properly."
}


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_WEBHOOK_SECRET", SECRET)


def send(body, header_value=None):
    headers = {"Content-Type": "application/json"}
    if header_value is not None:
        headers["cf-webhook-auth"] = header_value
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/cloudflare", content=content, headers=headers)


class TestVerification:
    def test_accepts_correct_secret(self):
        res = send(L7_DDOS, SECRET)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_wrong_secret(self):
        assert send(L7_DDOS, "not-the-secret").status_code == 401

    def test_rejects_secret_differing_in_last_char(self):
        assert send(L7_DDOS, SECRET[:-1] + "X").status_code == 401

    def test_rejects_prefix_of_secret(self):
        assert send(L7_DDOS, SECRET[:5]).status_code == 401

    def test_rejects_missing_header(self):
        assert send(L7_DDOS).status_code == 401

    def test_rejects_empty_header(self):
        assert send(L7_DDOS, "").status_code == 401

    def test_fails_closed_without_configured_secret(self, monkeypatch):
        monkeypatch.delenv("CLOUDFLARE_WEBHOOK_SECRET")
        assert send(L7_DDOS, SECRET).status_code == 500

    def test_authenticates_before_parsing(self):
        assert send("{not json", "wrong").status_code == 401

    def test_invalid_json_with_valid_secret_is_400(self):
        assert send("{not json", SECRET).status_code == 400


class TestEvents:
    @pytest.mark.parametrize(
        "payload",
        [
            L7_DDOS,
            HEALTH_CHECK,
            {**L7_DDOS, "alert_type": "dedicated_ssl_certificate_event_type"},
            {**L7_DDOS, "alert_type": "access_custom_certificate_expiration_type"},
            {**L7_DDOS, "alert_type": "workers_alert"},
            {**L7_DDOS, "alert_type": "some_future_alert_type"},
        ],
    )
    def test_accepts_alert_types(self, payload):
        assert send(payload, SECRET).status_code == 200

    def test_accepts_dashboard_test_message(self, capsys):
        assert send(TEST_MESSAGE, SECRET).status_code == 200
        assert "Test message" in capsys.readouterr().out

    def test_event_name(self):
        assert event_name(L7_DDOS) == "advanced_ddos_attack_l7_alert"
        assert event_name(TEST_MESSAGE) == "test"
        assert event_name(None) == "test"


class TestVerifyHelper:
    def test_matches_only_exact_value(self):
        assert verify_cloudflare_auth(SECRET, SECRET) is True
        assert verify_cloudflare_auth(f"Bearer {SECRET}", SECRET) is False
        assert verify_cloudflare_auth(None, SECRET) is False
        assert verify_cloudflare_auth(SECRET, None) is False
        assert verify_cloudflare_auth(SECRET, "") is False
