import json
import os

# Set test environment variables before importing the app
os.environ["CLOUDENTITY_WEBHOOK_API_KEY"] = "test_cloudentity_api_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_cloudentity_request

client = TestClient(app)

KEY = os.environ["CLOUDENTITY_WEBHOOK_API_KEY"]

EVENTS = [
    "user.created", "user.updated", "user.deleted", "user.authenticated",
    "group.created", "login.failed", "consent.revoked", "client.created",
]


def batch(*types):
    # Inferred shape: the event's subject_action name is the one key of `payload`.
    return {
        "audit_events": [
            {
                "tenant_id": "example",
                "server_id": "demo",
                "event_id": f"evt_{i}",
                "payload": {t.replace(".", "_"): {}},
            }
            for i, t in enumerate(types)
        ]
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(batch("user.created"))
    return client.post(
        "/webhooks/cloudentity",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestApiKeyVerification:
    def test_accepts_correct_key(self):
        res = post({"X-API-Key": KEY})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-api-key": KEY}).status_code == 200

    def test_rejects_wrong_key_same_length(self):
        assert post({"X-API-Key": "x" * len(KEY)}).status_code == 401

    def test_rejects_key_of_different_length(self):
        assert post({"X-API-Key": "short"}).status_code == 401

    def test_rejects_key_with_extra_characters(self):
        assert post({"X-API-Key": "x" + KEY}).status_code == 401

    def test_non_ascii_values_do_not_raise(self):
        # compare_digest raises TypeError on non-ASCII str; we compare bytes.
        assert verify_cloudentity_request({"x-api-key": "caf\u00e9"}, KEY) is False
        assert verify_cloudentity_request({"x-api-key": "caf\u00e9"}, "caf\u00e9") is True

    def test_rejects_missing_key(self):
        assert post().status_code == 401

    def test_does_not_accept_authorization_header(self):
        assert post({"Authorization": f"Bearer {KEY}"}).status_code == 401

    def test_rejects_everything_when_unconfigured(self, monkeypatch):
        assert verify_cloudentity_request({"x-api-key": KEY}, "") is False
        monkeypatch.delenv("CLOUDENTITY_WEBHOOK_API_KEY")
        assert verify_cloudentity_request({"x-api-key": KEY}) is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post({"X-API-Key": KEY}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert post({"X-API-Key": KEY}, body="{not json").status_code == 400

    def test_missing_audit_events_returns_400(self):
        assert post({"X-API-Key": KEY}, body='{"hello":"world"}').status_code == 400

    def test_invalid_json_without_key_returns_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({"X-API-Key": KEY}, body=json.dumps(batch(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_event_without_payload_key_is_acknowledged(self, capsys):
        body = {"audit_events": [{"tenant_id": "example", "server_id": "demo", "event_id": "evt_0"}]}
        res = post({"X-API-Key": KEY}, body=json.dumps(body))
        assert res.status_code == 200
        assert "Unhandled" in capsys.readouterr().out

    def test_handles_batch(self):
        body = json.dumps(batch("user.created", "user.authenticated", "group.created"))
        assert post({"X-API-Key": KEY}, body=body).status_code == 200

    def test_acknowledges_unknown_events(self):
        assert post({"X-API-Key": KEY}, body=json.dumps(batch("something.new"))).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
