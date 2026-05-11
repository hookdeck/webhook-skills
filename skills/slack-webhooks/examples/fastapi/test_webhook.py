import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["SLACK_SIGNING_SECRET"] = "test_slack_signing_secret"

from main import app, verify_slack_request  # noqa: E402

client = TestClient(app)

SIGNING_SECRET = os.environ["SLACK_SIGNING_SECRET"]


def generate_slack_signature(body: bytes, timestamp: str, secret: str) -> str:
    """Generate a valid Slack signature for testing."""
    basestring = f"v0:{timestamp}:{body.decode('utf-8')}".encode("utf-8")
    return "v0=" + hmac.new(
        secret.encode("utf-8"),
        basestring,
        hashlib.sha256,
    ).hexdigest()


def current_timestamp() -> str:
    return str(int(time.time()))


class TestVerifySlackRequest:
    def test_valid_signature_returns_true(self):
        body = b'{"type":"event_callback"}'
        ts = current_timestamp()
        sig = generate_slack_signature(body, ts, SIGNING_SECRET)

        assert verify_slack_request(body, sig, ts, SIGNING_SECRET) is True

    def test_invalid_signature_returns_false(self):
        body = b'{"type":"event_callback"}'
        ts = current_timestamp()

        assert verify_slack_request(body, "v0=deadbeef", ts, SIGNING_SECRET) is False

    def test_missing_signature_returns_false(self):
        ts = current_timestamp()
        assert verify_slack_request(b"{}", None, ts, SIGNING_SECRET) is False

    def test_missing_timestamp_returns_false(self):
        body = b"{}"
        sig = generate_slack_signature(body, current_timestamp(), SIGNING_SECRET)
        assert verify_slack_request(body, sig, None, SIGNING_SECRET) is False

    def test_stale_timestamp_returns_false(self):
        body = b"{}"
        stale = str(int(time.time()) - 60 * 6)
        sig = generate_slack_signature(body, stale, SIGNING_SECRET)

        assert verify_slack_request(body, sig, stale, SIGNING_SECRET) is False

    def test_tampered_body_returns_false(self):
        original = b'{"event":{"type":"app_mention"}}'
        tampered = b'{"event":{"type":"team_join"}}'
        ts = current_timestamp()
        sig = generate_slack_signature(original, ts, SIGNING_SECRET)

        assert verify_slack_request(tampered, sig, ts, SIGNING_SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = b"{}"
        ts = current_timestamp()
        sig = generate_slack_signature(body, ts, SIGNING_SECRET)

        assert verify_slack_request(body, sig, ts, "wrong_secret") is False

    def test_non_numeric_timestamp_returns_false(self):
        body = b"{}"
        sig = generate_slack_signature(body, "1531420618", SIGNING_SECRET)

        assert verify_slack_request(body, sig, "not-a-number", SIGNING_SECRET) is False


class TestSlackWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/slack",
            content='{"type":"event_callback"}',
            headers={
                "Content-Type": "application/json",
                "X-Slack-Request-Timestamp": current_timestamp(),
            },
        )
        assert response.status_code == 401
        assert response.text == "Invalid signature"

    def test_invalid_signature_returns_401(self):
        body = b'{"type":"event_callback"}'
        ts = current_timestamp()

        response = client.post(
            "/webhooks/slack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Signature": "v0=invalid",
                "X-Slack-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 401

    def test_url_verification_echoes_challenge(self):
        body = json.dumps(
            {
                "type": "url_verification",
                "token": "verification_token",
                "challenge": "abc123challengevalue",
            }
        ).encode("utf-8")
        ts = current_timestamp()
        sig = generate_slack_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/slack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Signature": sig,
                "X-Slack-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"challenge": "abc123challengevalue"}

    def test_valid_app_mention_event_returns_200(self):
        body = json.dumps(
            {
                "type": "event_callback",
                "team_id": "T0001",
                "api_app_id": "A0001",
                "event_id": "Ev0001",
                "event_time": 1731000000,
                "event": {
                    "type": "app_mention",
                    "user": "U123",
                    "text": "<@U7LFEMQ6F> hello!",
                    "channel": "C123",
                    "ts": "1731000000.000100",
                },
            }
        ).encode("utf-8")
        ts = current_timestamp()
        sig = generate_slack_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/slack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Signature": sig,
                "X-Slack-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 200
        assert response.text == "OK"

    def test_reaction_added_event_returns_200(self):
        body = json.dumps(
            {
                "type": "event_callback",
                "event_id": "Ev0002",
                "event": {
                    "type": "reaction_added",
                    "user": "U123",
                    "reaction": "thumbsup",
                },
            }
        ).encode("utf-8")
        ts = current_timestamp()
        sig = generate_slack_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/slack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Signature": sig,
                "X-Slack-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 200

    def test_team_join_event_returns_200(self):
        body = json.dumps(
            {
                "type": "event_callback",
                "event_id": "Ev0003",
                "event": {"type": "team_join", "user": {"id": "U999"}},
            }
        ).encode("utf-8")
        ts = current_timestamp()
        sig = generate_slack_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/slack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Signature": sig,
                "X-Slack-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 200

    def test_invalid_json_returns_400(self):
        body = b"not valid json"
        ts = current_timestamp()
        sig = generate_slack_signature(body, ts, SIGNING_SECRET)

        response = client.post(
            "/webhooks/slack",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Signature": sig,
                "X-Slack-Request-Timestamp": ts,
            },
        )
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
