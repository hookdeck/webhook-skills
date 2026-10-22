import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Kombo Webhook Secret: an arbitrary string used as its UTF-8 bytes (not decoded)
SECRET = "test_kombo_webhook_secret"
os.environ["KOMBO_WEBHOOK_SECRET"] = SECRET

from main import app, verify_kombo_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = SECRET) -> str:
    """Sign like Kombo: HMAC-SHA256, base64url without padding."""
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def payload(event_type: str, data: dict) -> str:
    # Kombo encodes the JSON body with two-space indentation
    return json.dumps({"id": "5gjAtURLPbnTiwgkaBfiA3WJ", "type": event_type, "data": data}, indent=2)


def post(body: str, headers: dict = None, content_type: str = "application/json"):
    return client.post(
        "/webhooks/kombo",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


class TestVerifyKomboWebhook:
    body = payload("data-changed", {"integration_id": "bombohr:ats-dev"})

    def test_accepts_valid_signature(self):
        assert verify_kombo_webhook(self.body.encode(), sign(self.body), SECRET)

    def test_signature_is_unpadded_base64url(self):
        sig = sign(self.body)
        assert "=" not in sig and "+" not in sig and "/" not in sig

    def test_rejects_invalid_inputs(self):
        raw = self.body.encode()
        assert not verify_kombo_webhook(raw, sign(self.body, "other"), SECRET)
        assert not verify_kombo_webhook(raw, None, SECRET)
        assert not verify_kombo_webhook(raw, "!!!not-base64!!!", SECRET)
        assert not verify_kombo_webhook(raw, "abc", SECRET)

    def test_rejects_compact_reserialization(self):
        compact = json.dumps(json.loads(self.body), separators=(",", ":"))
        assert not verify_kombo_webhook(compact.encode(), sign(self.body), SECRET)


class TestWebhookEndpoint:
    @pytest.mark.parametrize(
        "event_type,data",
        [
            ("data-changed", {"integration_id": "bombohr:ats-dev", "changed_models": [{"name": "ats_applications"}]}),
            ("sync-finished", {"sync_id": "B89SCXXho7Yw8PGo8AKJxLn4", "sync_state": "SUCCEEDED"}),
            ("integration-created", {"id": "personio:CBNMt7dSNCzBdnRTx87dev4E", "tool": "personio", "category": "HRIS"}),
            ("integration-deleted", {"id": "personio:CBNMt7dSNCzBdnRTx87dev4E"}),
            ("integration-state-changed", {"integration_id": "personio:CBNMt7dSNCzBdnRTx87dev4E", "state": "INVALID"}),
            ("connection-flow-failed", {"integration_tool": "personio", "log_url": "https://app.kombo.dev/logs/1"}),
            ("issue-status-changed", {"change": "raised", "issue": {"type": "integration.authentication_failed"}}),
            ("assessment:order-received", {"id": "B5KQKhAgTv6ZwzrfAbqbhipd", "package_id": "typescript_test"}),
            ("some-future-event", {}),
        ],
    )
    def test_valid_signature_returns_200(self, event_type, data):
        body = payload(event_type, data)
        assert post(body, {"X-Kombo-Signature": sign(body)}).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = payload("data-changed", {})
        res = post(body, {"X-Kombo-Signature": sign(body)}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_signature_returns_400(self):
        body = payload("data-changed", {})
        assert post(body, {"X-Kombo-Signature": sign(body, "wrong_secret")}).status_code == 400

    def test_missing_signature_returns_400(self):
        assert post(payload("data-changed", {})).status_code == 400

    def test_tampered_body_returns_400(self):
        body = payload("data-changed", {"integration_id": "a"})
        res = post(body.replace('"a"', '"b"'), {"X-Kombo-Signature": sign(body)})
        assert res.status_code == 400

    def test_signed_non_json_returns_400(self):
        body = "not json"
        assert post(body, {"X-Kombo-Signature": sign(body)}).status_code == 400
