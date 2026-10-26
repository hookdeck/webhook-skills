import json
import os

# Set test environment variables before importing the app
os.environ["RAILWAY_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["RAILWAY_WEBHOOK_SECRET"] = "test_railway_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_railway_request

client = TestClient(app)

HEADER = os.environ["RAILWAY_WEBHOOK_HEADER"]
SECRET = os.environ["RAILWAY_WEBHOOK_SECRET"]


def sample_payload(event_type="Deployment.failed"):
    return {
        "type": event_type,
        "details": {"id": "8107edff-4b8e-44fc-b43a-04566e847a2a", "source": "GitHub", "branch": "main"},
        "resource": {
            "workspace": {"id": "w1", "name": "acme"},
            "project": {"id": "p1", "name": "api"},
            "environment": {"id": "e1", "name": "production", "isEphemeral": False},
            "service": {"id": "s1", "name": "web"},
            "deployment": {"id": "d1"},
        },
        "severity": "WARNING",
        "timestamp": "2025-11-21T23:48:42.311Z",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/railway",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_lookup_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_rejects_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_secret_under_a_different_header(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_compares_whole_value_without_stripping_bearer(self):
        bearer = "Bearer abc123"
        assert verify_railway_request(Headers({"authorization": bearer}), bearer, "Authorization") is True
        assert verify_railway_request(Headers({"authorization": "abc123"}), bearer, "Authorization") is False
        assert verify_railway_request(Headers({"authorization": bearer}), "abc123", "Authorization") is False

    def test_non_ascii_values_do_not_raise(self):
        assert verify_railway_request(Headers({"authorization": "Bearer é"}), "Bearer é", "Authorization") is True
        assert verify_railway_request(Headers({"authorization": "Bearer é"}), "Bearer abc", "Authorization") is False

    def test_defaults_header_name_to_authorization(self, monkeypatch):
        monkeypatch.delenv("RAILWAY_WEBHOOK_HEADER")
        assert verify_railway_request(Headers({"authorization": SECRET})) is True
        assert verify_railway_request(Headers({"x-webhook-secret": SECRET})) is False

    def test_rejects_everything_when_no_secret_configured(self):
        assert verify_railway_request(Headers({"x-webhook-secret": SECRET}), "", HEADER) is False
        assert verify_railway_request(Headers({"x-webhook-secret": ""}), "", HEADER) is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_400_for_invalid_json_after_auth(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_400_for_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_401_not_400_for_invalid_json_without_header(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    def test_handles_deployment_failed(self, capsys):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert "Deployment failed" in capsys.readouterr().out

    def test_handles_other_deployment_states_by_prefix(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("Deployment.success")))
        assert res.status_code == 200
        assert "Deployment success" in capsys.readouterr().out

    def test_acknowledges_alert_and_unknown_types(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("Alert.triggered")))
        assert res.status_code == 200
        assert "Unhandled event" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
