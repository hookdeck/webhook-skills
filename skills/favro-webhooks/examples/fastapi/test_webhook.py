import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["FAVRO_WEBHOOK_SECRET"] = "test_favro_webhook_secret"
os.environ["FAVRO_WEBHOOK_URL"] = "https://example.com/webhooks/favro"

from main import app, event_key, verify_favro_webhook

client = TestClient(app)

SECRET = os.environ["FAVRO_WEBHOOK_SECRET"]
URL = os.environ["FAVRO_WEBHOOK_URL"]

CARD_PAYLOAD = {
    "payloadId": "AbCdEf012345==",
    "action": "created",
    "hookId": "5c1a0000",
    "card": {"cardId": "card-1", "name": "Implement webhook receiver"},
}

PING_PAYLOAD = {
    "payloadId": "PiNg000000==",
    "action": "ping",
    "hookId": "5c1a0000",
    "hook": {"url": URL},
}


def sign(payload_id: str, url: str = URL, secret: str = SECRET) -> str:
    """Compute a valid X-Favro-Webhook signature.

    base64(HMAC-SHA1(secret, payload_id + webhook_url)).
    """
    digest = hmac.new(
        secret.encode("utf-8"),
        (payload_id + url).encode("utf-8"),
        hashlib.sha1,
    ).digest()
    return base64.b64encode(digest).decode("ascii")


class TestVerifyFavroWebhook:
    def test_valid_signature_returns_true(self):
        sig = sign(CARD_PAYLOAD["payloadId"])
        assert verify_favro_webhook(CARD_PAYLOAD["payloadId"], URL, SECRET, sig) is True

    def test_tampered_payload_id_returns_false(self):
        sig = sign(CARD_PAYLOAD["payloadId"])
        assert verify_favro_webhook("different-id", URL, SECRET, sig) is False

    def test_wrong_url_returns_false(self):
        sig = sign(CARD_PAYLOAD["payloadId"])
        assert (
            verify_favro_webhook(CARD_PAYLOAD["payloadId"], "https://evil.example/x", SECRET, sig)
            is False
        )

    def test_wrong_secret_returns_false(self):
        sig = sign(CARD_PAYLOAD["payloadId"])
        assert verify_favro_webhook(CARD_PAYLOAD["payloadId"], URL, "wrong_secret", sig) is False

    def test_missing_signature_returns_false(self):
        assert verify_favro_webhook(CARD_PAYLOAD["payloadId"], URL, SECRET, "") is False


class TestEventKey:
    def test_ping(self):
        assert event_key(PING_PAYLOAD) == "ping"

    def test_card_action(self):
        assert event_key({"action": "moved", "card": {}}) == "card.moved"

    def test_comment_action(self):
        assert event_key({"action": "created", "comment": {}}) == "comment.created"

    def test_comment_action_with_card(self):
        assert event_key({"action": "updated", "card": {}, "comment": {}}) == "comment.updated"


class TestFavroWebhookEndpoint:
    def _post(self, payload: dict, signature: str = None):
        raw = json.dumps(payload)
        sig = signature if signature is not None else sign(payload["payloadId"])
        return client.post(
            "/webhooks/favro",
            content=raw,
            headers={"Content-Type": "application/json", "X-Favro-Webhook": sig},
        )

    def test_valid_card_event_returns_200(self):
        response = self._post(CARD_PAYLOAD)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_setup_ping_returns_200(self):
        response = self._post(PING_PAYLOAD)
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_invalid_signature_returns_401(self):
        response = self._post(CARD_PAYLOAD, signature="not-a-valid-signature")
        assert response.status_code == 401

    def test_missing_signature_header_returns_401(self):
        raw = json.dumps(CARD_PAYLOAD)
        response = client.post(
            "/webhooks/favro",
            content=raw,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        # Sign the original id, then change it in the body.
        sig = sign(CARD_PAYLOAD["payloadId"])
        tampered = {**CARD_PAYLOAD, "payloadId": "tampered=="}
        response = self._post(tampered, signature=sig)
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "event",
        [
            {"action": "created", "card": {}},
            {"action": "committed", "card": {}},
            {"action": "moved", "card": {}},
            {"action": "updated", "card": {}},
            {"action": "deleted", "card": {}},
            {"action": "created", "comment": {}},
            {"action": "updated", "comment": {}},
            {"action": "deleted", "comment": {}},
        ],
    )
    def test_handles_each_event(self, event):
        payload = {"payloadId": f"id-{event['action']}-{'card' in event}==", "hookId": "h", **event}
        response = self._post(payload)
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
