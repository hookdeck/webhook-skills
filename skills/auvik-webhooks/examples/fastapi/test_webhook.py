import json
import os

# Set test environment variables before importing the app
os.environ["AUVIK_WEBHOOK_HEADER"] = "X-Auvik-Key"
os.environ["AUVIK_WEBHOOK_SECRET"] = "Bearer test_auvik_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_auvik_request

client = TestClient(app)

HEADER = os.environ["AUVIK_WEBHOOK_HEADER"]
SECRET = os.environ["AUVIK_WEBHOOK_SECRET"]


def sample_payload(status="Triggered"):
    return {
        "alertId": "1234",
        "alertName": "Device offline",
        "alertStatus": 0 if status == "Triggered" else 1,
        "alertStatusString": status,
        "alertDescription": "Switch is unreachable",
        "entityName": "core-switch-01",
        "companyName": "Acme MSP",
        "date": "2026-10-25T10:00:00.000Z",
        "link": "https://example.auvik.com/alert/1234",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/auvik",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderAuthentication:
    def test_accepts_exact_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_stripped_bearer_prefix_rejected(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_other_header(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        res = client.post(
            "/webhooks/auvik",
            content=json.dumps(sample_payload()),
            headers=[(HEADER.encode(), "café".encode("latin-1"))],
        )
        assert res.status_code == 401

    def test_auth_before_parsing(self):
        assert post({HEADER: "nope"}, body="not json").status_code == 401


class TestBodyHandling:
    @pytest.mark.parametrize("status", ["Triggered", "Cleared"])
    def test_handles_status(self, status):
        assert post({HEADER: SECRET}, body=json.dumps(sample_payload(status))).status_code == 200

    def test_unknown_status(self):
        assert post({HEADER: SECRET}, body=json.dumps(sample_payload("Other"))).status_code == 200

    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="not json").status_code == 400

    def test_non_object(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400


class TestVerifyFunction:
    def test_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("AUVIK_WEBHOOK_HEADER")
        assert verify_auvik_request(Headers({"authorization": SECRET})) is True

    def test_fails_closed_without_secret(self):
        assert verify_auvik_request(Headers({"x-auvik-key": "a"}), "X-Auvik-Key", "") is False
