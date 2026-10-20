import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# ClickUp secrets are 64-char uppercase alphanumeric strings (webhook.secret from the API)
os.environ["CLICKUP_WEBHOOK_SECRET"] = "O94IM25S7PXBPYTMNXLLET230SRP0S89COR7B1YOJ2ZIE8WQNK5UUKEF26W0Z5GA"

from main import app, verify_clickup_webhook  # noqa: E402

client = TestClient(app)

SECRET = os.environ["CLICKUP_WEBHOOK_SECRET"]
WEBHOOK_ID = "7fa3ec74-69a8-4530-a251-8a13730bd204"


def generate_clickup_signature(payload: str, secret: str) -> str:
    """Generate an X-Signature value the same way ClickUp does: hex(HMAC-SHA256(secret, raw_body))."""
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def post_signed(payload: str, signature: str | None = None):
    if signature is None:
        signature = generate_clickup_signature(payload, SECRET)
    return client.post(
        "/webhooks/clickup",
        content=payload,
        headers={"Content-Type": "application/json", "X-Signature": signature},
    )


class TestVerifyClickUpWebhook:
    payload = b'{"webhook_id":"7689a169-a000-4985-8676-6902b96d6627","event":"taskCreated","task_id":"c0j"}'

    def test_valid_signature(self):
        signature = generate_clickup_signature(self.payload.decode(), SECRET)
        assert verify_clickup_webhook(self.payload, signature, SECRET) is True

    def test_uppercase_hex_signature(self):
        signature = generate_clickup_signature(self.payload.decode(), SECRET).upper()
        assert verify_clickup_webhook(self.payload, signature, SECRET) is True

    def test_invalid_signature(self):
        assert verify_clickup_webhook(self.payload, "invalid", SECRET) is False

    def test_missing_signature(self):
        assert verify_clickup_webhook(self.payload, None, SECRET) is False

    def test_missing_secret(self):
        signature = generate_clickup_signature(self.payload.decode(), SECRET)
        assert verify_clickup_webhook(self.payload, signature, None) is False

    def test_wrong_secret(self):
        signature = generate_clickup_signature(self.payload.decode(), "wrong_secret")
        assert verify_clickup_webhook(self.payload, signature, SECRET) is False

    def test_tampered_payload(self):
        signature = generate_clickup_signature(self.payload.decode(), SECRET)
        tampered = self.payload.replace(b"c0j", b"xyz")
        assert verify_clickup_webhook(tampered, signature, SECRET) is False

    def test_prefixed_signature_rejected(self):
        # ClickUp sends the bare hex digest, not sha256=<hex>
        signature = "sha256=" + generate_clickup_signature(self.payload.decode(), SECRET)
        assert verify_clickup_webhook(self.payload, signature, SECRET) is False


class TestClickUpWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/clickup",
            content=json.dumps({"event": "taskCreated", "task_id": "abc", "webhook_id": WEBHOOK_ID}),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Missing X-Signature header"

    def test_invalid_signature_returns_400_not_401(self):
        payload = json.dumps({"event": "taskCreated", "task_id": "abc", "webhook_id": WEBHOOK_ID})
        response = post_signed(payload, "a" * 64)
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_missing_secret_returns_400(self, monkeypatch):
        payload = json.dumps({"event": "taskCreated", "task_id": "abc", "webhook_id": WEBHOOK_ID})
        signature = generate_clickup_signature(payload, SECRET)
        monkeypatch.delenv("CLICKUP_WEBHOOK_SECRET")
        response = post_signed(payload, signature)
        assert response.status_code == 400

    def test_verifies_raw_body_not_reserialized_json(self):
        # Extra whitespace: a json round-trip would change these bytes
        payload = '{ "event": "taskCreated",  "task_id": "abc", "webhook_id": "' + WEBHOOK_ID + '" }'
        response = post_signed(payload)
        assert response.status_code == 200

    def test_signed_invalid_json_returns_400(self):
        response = post_signed("not json")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON"

    @pytest.mark.parametrize(
        "payload",
        [
            {
                "event": "taskCreated",
                "history_items": [{"id": "2800763136700363640", "field": "task_creation"}],
                "task_id": "1vj37mc",
                "webhook_id": WEBHOOK_ID,
            },
            {"event": "taskUpdated", "task_id": "1vj37mc", "webhook_id": WEBHOOK_ID},
            {
                "event": "taskStatusUpdated",
                "history_items": [
                    {
                        "id": "2800763136717140857",
                        "field": "status",
                        "before": {"status": "to do"},
                        "after": {"status": "in progress"},
                    }
                ],
                "task_id": "1vj37mc",
                "webhook_id": WEBHOOK_ID,
            },
            {"event": "taskCommentPosted", "task_id": "1vj37mc", "webhook_id": WEBHOOK_ID},
            {"event": "listCreated", "list_id": "162641285", "webhook_id": WEBHOOK_ID},
            {
                "event": "goalCreated",
                "goal_id": "a23e5a3d-74b5-44c2-ab53-917ebe85045a",
                "webhook_id": "d5eddb2d-db2b-49e9-87d4-bc6cfbe2313b",
            },
            {"event": "somethingNew", "webhook_id": WEBHOOK_ID},
        ],
        ids=lambda p: p["event"],
    )
    def test_handles_events(self, payload):
        response = post_signed(json.dumps(payload))
        assert response.status_code == 200
        assert response.json() == {"received": True}


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
