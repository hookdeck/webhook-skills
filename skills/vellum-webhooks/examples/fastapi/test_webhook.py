import json
import os

# Set test environment variables before importing the app
os.environ["VELLUM_WEBHOOK_HEADER"] = "Authorization"
os.environ["VELLUM_WEBHOOK_SECRET"] = "Bearer test_vellum_token_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_vellum_request

client = TestClient(app)

SECRET = os.environ["VELLUM_WEBHOOK_SECRET"]
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

EVENTS = [
    "workflow.execution.initiated",
    "workflow.execution.fulfilled",
    "workflow.execution.rejected",
    "workflow_execution.usage_calculation.fulfilled",
    "workflow_execution.usage_calculation.rejected",
    "metric.execution.fulfilled",
]

_counter = 0


def sample_payload(name="workflow.execution.fulfilled"):
    global _counter
    _counter += 1
    return {
        "id": f"00000000-0000-4000-8000-{_counter:012d}",
        "timestamp": "2026-10-26T12:00:00Z",
        "api_version": "2024-10-25",
        "trace_id": "11111111-1111-4111-8111-111111111111",
        "span_id": "22222222-2222-4222-8222-222222222222",
        "parent": None,
        "name": name,
        "body": {"workflow_class": {"name": "MyWorkflow", "module": ["my", "workflow"], "bases": []}, "outputs": {}},
    }


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/vellum",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_accepts_correct_credential(self):
        res = send(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_compares_whole_value_including_bearer_prefix(self):
        res = send(headers={"Authorization": SECRET.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_wrong_value_same_length(self):
        res = send(headers={"Authorization": "x" * len(SECRET)})
        assert res.status_code == 401

    def test_rejects_value_of_different_length(self):
        res = send(headers={"Authorization": "short"})
        assert res.status_code == 401

    def test_rejects_missing_credential(self):
        assert send().status_code == 401

    def test_rejects_when_no_secret_configured(self):
        assert verify_vellum_request({"authorization": "anything"}, secret="") is False

    def test_custom_header_name_case_insensitive(self):
        assert verify_vellum_request(Headers({"x-api-key": "k"}), "k", "X-API-Key") is True
        assert verify_vellum_request(Headers({"x-api-key": "k"}), "k", "X-Other") is False

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_vellum_request(Headers({"x-api-key": "ké"}), "kè", "X-API-Key") is False
        assert verify_vellum_request(Headers({"x-api-key": "kè"}), "kè", "X-API-Key") is True


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_with_credential(self, method):
        assert send(method, headers={"Authorization": SECRET}).status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_without_credential(self, method):
        assert send(method).status_code == 401

    def test_accepts_empty_body(self):
        res = client.get("/webhooks/vellum", headers={"Authorization": SECRET})
        assert res.status_code == 200


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = send(headers={"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert send(headers={"Authorization": SECRET}, body="{nope").status_code == 400

    def test_non_object_returns_400(self):
        assert send(headers={"Authorization": SECRET}, body="[1]").status_code == 400

    def test_authenticates_before_parsing(self):
        assert send(body="{nope").status_code == 401


class TestEvents:
    @pytest.mark.parametrize("name", EVENTS)
    def test_handles_event(self, name):
        res = send(headers={"Authorization": SECRET}, body=json.dumps(sample_payload(name)))
        assert res.status_code == 200

    def test_acknowledges_unknown_events(self):
        res = send(headers={"Authorization": SECRET}, body=json.dumps(sample_payload("something.else")))
        assert res.status_code == 200

    def test_dedupes_on_id(self):
        body = json.dumps(sample_payload())
        send(headers={"Authorization": SECRET}, body=body)
        res = send(headers={"Authorization": SECRET}, body=body)
        assert res.status_code == 200
        assert res.json().get("duplicate") is True
