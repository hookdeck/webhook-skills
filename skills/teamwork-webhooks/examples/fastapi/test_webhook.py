import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Teamwork tokens are free-form strings you choose when creating the Version 2 webhook
os.environ["TEAMWORK_WEBHOOK_TOKEN"] = "tw_test_token_0123456789"

from main import app, verify_teamwork_webhook  # noqa: E402

client = TestClient(app)

TOKEN = os.environ["TEAMWORK_WEBHOOK_TOKEN"]


def generate_teamwork_signature(payload: str, secret: str) -> str:
    """Generate an X-Projects-Signature value the same way Teamwork does: hex(HMAC-SHA256(token, raw_body))."""
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def post(payload: str, signature: str | None = None, event: str | None = "TASK.CREATED",
         content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is None:
        signature = generate_teamwork_signature(payload, TOKEN)
    if signature != "":
        headers["X-Projects-Signature"] = signature
    if event:
        headers["X-Projects-Event"] = event
    return client.post("/webhooks/teamwork", content=payload, headers=headers)


class TestVerifyTeamworkWebhook:
    payload = b'{"eventCreator":{"id":1},"task":{"id":42}}'

    def test_valid_signature(self):
        sig = generate_teamwork_signature(self.payload.decode(), TOKEN)
        assert verify_teamwork_webhook(self.payload, sig, TOKEN) is True

    def test_uppercase_hex_signature(self):
        sig = generate_teamwork_signature(self.payload.decode(), TOKEN).upper()
        assert verify_teamwork_webhook(self.payload, sig, TOKEN) is True

    def test_wrong_token(self):
        sig = generate_teamwork_signature(self.payload.decode(), "other")
        assert verify_teamwork_webhook(self.payload, sig, TOKEN) is False

    def test_tampered_body(self):
        sig = generate_teamwork_signature(self.payload.decode(), TOKEN)
        assert verify_teamwork_webhook(self.payload + b" ", sig, TOKEN) is False

    def test_missing_signature_or_token(self):
        assert verify_teamwork_webhook(self.payload, None, TOKEN) is False
        assert verify_teamwork_webhook(self.payload, "a" * 64, None) is False

    def test_wrong_length_signature(self):
        assert verify_teamwork_webhook(self.payload, "abc123", TOKEN) is False

    def test_non_ascii_signature_is_false_not_error(self):
        assert verify_teamwork_webhook(self.payload, "é" * 64, TOKEN) is False


class TestWebhookEndpoint:
    @pytest.mark.parametrize("event", [
        "TASK.CREATED",
        "TASK.UPDATED",
        "TASK.COMPLETED",
        "TASK.DELETED",
        "PROJECT.CREATED",
        "COMMENT.CREATED",
        "MILESTONE.COMPLETED",
        "TIME.CREATED",
        "FILE.DOWNLOADED",
    ])
    def test_accepts_event(self, event):
        payload = json.dumps({"eventCreator": {"id": 1}, "id": 7, "projectId": 3})
        response = post(payload, event=event)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_verifies_any_content_type(self):
        payload = json.dumps({"eventCreator": {"id": 1}, "project": {"id": 9}})
        assert post(payload, event="PROJECT.CREATED", content_type="text/plain").status_code == 200

    def test_invalid_signature_returns_401(self):
        assert post('{"task":{"id":1}}', signature="a" * 64).status_code == 401

    def test_missing_signature_returns_401(self):
        payload = '{"task":{"id":1}}'
        response = client.post("/webhooks/teamwork", content=payload,
                               headers={"Content-Type": "application/json", "X-Projects-Event": "TASK.CREATED"})
        assert response.status_code == 401

    def test_non_ascii_signature_header_returns_401(self):
        payload = '{"task":{"id":1}}'
        response = client.post(
            "/webhooks/teamwork",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Projects-Signature": "é".encode("utf-8"),
                "X-Projects-Event": "TASK.CREATED",
            },
        )
        assert response.status_code == 401

    def test_tampered_body_returns_401(self):
        sig = generate_teamwork_signature('{"task":{"id":1}}', TOKEN)
        assert post('{"task":{"id":2}}', signature=sig).status_code == 401

    def test_signed_non_json_returns_400(self):
        assert post("not json").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
