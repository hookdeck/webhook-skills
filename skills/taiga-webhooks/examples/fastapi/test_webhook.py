import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Taiga's secret key is a free-form string chosen by the project admin
os.environ["TAIGA_WEBHOOK_SECRET"] = "taiga_test_secret_key"

from main import app, verify_taiga_webhook  # noqa: E402

client = TestClient(app)

SECRET = os.environ["TAIGA_WEBHOOK_SECRET"]


def generate_taiga_signature(payload: str, secret: str) -> str:
    """Generate an X-TAIGA-WEBHOOK-SIGNATURE value the same way Taiga does: hex(HMAC-SHA1(secret, raw_body))."""
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).hexdigest()


def event(type_: str, action: str, data: dict | None = None) -> str:
    body = {
        "action": action,
        "type": type_,
        "by": {"id": 6, "username": "user1"},
        "date": "2016-04-12T12:17:20.486Z",
        "data": data if data is not None else {"id": 139, "subject": "test user story"},
    }
    if action == "change":
        body["change"] = {"comment": "", "diff": {}}
    return json.dumps(body)


def post_signed(payload: str, signature: str | None = None, content_type: str = "application/json"):
    if signature is None:
        signature = generate_taiga_signature(payload, SECRET)
    return client.post(
        "/webhooks/taiga",
        content=payload,
        headers={"Content-Type": content_type, "X-TAIGA-WEBHOOK-SIGNATURE": signature},
    )


class TestVerifyTaigaWebhook:
    payload = event("userstory", "create").encode()

    def test_accepts_valid_signature(self):
        sig = generate_taiga_signature(self.payload.decode(), SECRET)
        assert verify_taiga_webhook(self.payload, sig, SECRET)

    def test_accepts_uppercase_signature(self):
        sig = generate_taiga_signature(self.payload.decode(), SECRET).upper()
        assert verify_taiga_webhook(self.payload, sig, SECRET)

    def test_rejects_other_key(self):
        sig = generate_taiga_signature(self.payload.decode(), "other")
        assert not verify_taiga_webhook(self.payload, sig, SECRET)

    def test_rejects_modified_body(self):
        sig = generate_taiga_signature(self.payload.decode(), SECRET)
        assert not verify_taiga_webhook(self.payload + b" ", sig, SECRET)

    def test_rejects_sha1_prefixed_value(self):
        sig = "sha1=" + generate_taiga_signature(self.payload.decode(), SECRET)
        assert not verify_taiga_webhook(self.payload, sig, SECRET)

    def test_rejects_sha256_signature(self):
        sig = hmac.new(SECRET.encode(), self.payload, hashlib.sha256).hexdigest()
        assert not verify_taiga_webhook(self.payload, sig, SECRET)

    def test_rejects_missing_signature_or_secret(self):
        sig = generate_taiga_signature(self.payload.decode(), SECRET)
        assert not verify_taiga_webhook(self.payload, None, SECRET)
        assert not verify_taiga_webhook(self.payload, sig, None)

    def test_rejects_short_signature(self):
        assert not verify_taiga_webhook(self.payload, "abc", SECRET)


class TestWebhookEndpoint:
    @pytest.mark.parametrize(
        "type_,action",
        [
            ("userstory", "create"),
            ("userstory", "change"),
            ("userstory", "delete"),
            ("task", "create"),
            ("task", "change"),
            ("task", "delete"),
            ("issue", "create"),
            ("epic", "change"),
            ("milestone", "delete"),
            ("wikipage", "create"),
        ],
    )
    def test_accepts_events(self, type_, action):
        response = post_signed(event(type_, action))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_test_event(self):
        assert post_signed(event("test", "test", {"test": "test"})).status_code == 200

    def test_accepts_unknown_events(self):
        assert post_signed(event("swimlane", "create")).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post_signed(event("task", "create"), content_type="text/plain").status_code == 200

    def test_rejects_invalid_signature(self):
        assert post_signed(event("task", "create"), "deadbeef").status_code == 400

    def test_rejects_missing_signature(self):
        response = client.post(
            "/webhooks/taiga",
            content=event("task", "create"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_rejects_altered_body(self):
        body = event("task", "create")
        sig = generate_taiga_signature(body, SECRET)
        assert post_signed(body.replace("139", "140"), sig).status_code == 400

    def test_rejects_signed_non_json(self):
        assert post_signed("not json").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
