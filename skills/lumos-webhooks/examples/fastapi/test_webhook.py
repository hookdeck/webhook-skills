import json
import os

# Set test environment variables before importing the app
os.environ["LUMOS_WEBHOOK_SECRET"] = "Bearer test_lumos_secret_0123456789"
os.environ.pop("LUMOS_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_lumos_request

client = TestClient(app)

SECRET = os.environ["LUMOS_WEBHOOK_SECRET"]


def sample_payload():
    # Illustrative payload: Lumos does not publish the field names.
    return {
        "user": {"email": "ada@example.com", "given_name": "Ada", "family_name": "Lovelace"},
        "account": {"id": "acct_123", "email": "ada@example.com", "username": "ada"},
        "application": {"name": "Zendesk", "instance_id": "inst_456"},
        "permissions": ["Agent License"],
        "comment": "Offboarding",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/lumos",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCustomHeaderVerification:
    def test_accepts_correct_value_with_bearer_prefix(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_does_not_strip_bearer_prefix(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_does_not_accept_lumos_signature_header_as_credential(self):
        assert post({"X-Lumos-Webhook-Signature": SECRET}).status_code == 401

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        assert verify_lumos_request(Headers({"authorization": SECRET}), "Authorization", "") is False
        monkeypatch.delenv("LUMOS_WEBHOOK_SECRET")
        assert verify_lumos_request(Headers({"authorization": SECRET})) is False


class TestConfiguredHeaderName:
    def test_reads_credential_from_configured_header(self, monkeypatch):
        monkeypatch.setenv("LUMOS_WEBHOOK_HEADER", "X-Api-Key")
        assert post({"X-Api-Key": SECRET}).status_code == 200
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_values_do_not_raise(self):
        headers = Headers({"x-api-key": "café"})
        assert verify_lumos_request(headers, "X-Api-Key", "café") is True
        assert verify_lumos_request(headers, "X-Api-Key", "cafe") is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credentials_returns_401(self):
        assert post(body="{not json").status_code == 401

    def test_payload_with_no_recognised_fields(self):
        assert post({"Authorization": SECRET}, body="{}").status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
