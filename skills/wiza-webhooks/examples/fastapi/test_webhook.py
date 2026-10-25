import hashlib
import json
import os

# Set test environment variables before importing the app
os.environ["WIZA_API_KEY"] = "test_wiza_api_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_wiza_request

client = TestClient(app)

API_KEY = os.environ["WIZA_API_KEY"]
# What Wiza sends: lowercase hex SHA-256 of the API key
AUTH_KEY = hashlib.sha256(API_KEY.encode()).hexdigest()


def sample_payload(code=200):
    return {
        "status": {"code": code, "message": "Single reveal finished" if code == 200 else "Failed"},
        "type": "individual_reveal",
        "data": {
            "id": 12345,
            "status": "finished" if code == 200 else "failed",
            "email": "jane@example.com",
            "name": "Jane Doe",
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/wiza",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthKeyVerification:
    def test_accepts_sha256_hex_of_api_key(self):
        res = post({"x-auth-key": AUTH_KEY})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"X-Auth-Key": AUTH_KEY}).status_code == 200

    def test_rejects_raw_api_key(self):
        assert post({"x-auth-key": API_KEY}).status_code == 401

    def test_rejects_wrong_hash_of_same_length(self):
        assert post({"x-auth-key": "a" * len(AUTH_KEY)}).status_code == 401

    def test_rejects_different_length(self):
        assert post({"x-auth-key": "short"}).status_code == 401

    def test_rejects_non_ascii_without_error(self):
        # compare_digest raises TypeError on non-ASCII str; bytes comparison must not.
        res = client.post(
            "/webhooks/wiza",
            content=json.dumps(sample_payload()),
            headers={"Content-Type": "application/json", "x-auth-key": "café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_everything_when_unconfigured(self, monkeypatch):
        assert verify_wiza_request({"x-auth-key": AUTH_KEY}, "") is False
        monkeypatch.delenv("WIZA_API_KEY")
        assert verify_wiza_request({"x-auth-key": AUTH_KEY}) is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post({"x-auth-key": AUTH_KEY}, content_type="text/plain").status_code == 200

    def test_invalid_json_after_auth_is_400(self):
        assert post({"x-auth-key": AUTH_KEY}, body="{not json").status_code == 400

    def test_non_object_json_is_400(self):
        assert post({"x-auth-key": AUTH_KEY}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    def test_finished_reveal(self, capsys):
        res = post({"x-auth-key": AUTH_KEY})
        assert res.status_code == 200
        assert "Reveal 12345 finished" in capsys.readouterr().out

    def test_failed_reveal(self, capsys):
        res = post({"x-auth-key": AUTH_KEY}, body=json.dumps(sample_payload(400)))
        assert res.status_code == 200
        assert "Reveal 12345 failed" in capsys.readouterr().out

    def test_unknown_type_is_acknowledged(self, capsys):
        res = post({"x-auth-key": AUTH_KEY}, body=json.dumps({"type": "something_new", "data": {"id": 1}}))
        assert res.status_code == 200
        assert "Unhandled event type: something_new" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
