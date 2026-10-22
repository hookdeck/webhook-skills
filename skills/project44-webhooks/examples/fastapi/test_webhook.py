import json
import os

# Set test environment variables before importing the app
os.environ["PROJECT44_WEBHOOK_SECRET"] = "test_project44_secret_0123456789"
os.environ.pop("PROJECT44_WEBHOOK_HEADER", None)  # default: X-Api-Key

import pytest
from fastapi.testclient import TestClient

from main import app, verify_project44_request

client = TestClient(app)

SECRET = os.environ["PROJECT44_WEBHOOK_SECRET"]

EVENTS = [
    "shipments.v1.shipment.created", "shipments.v1.shipment.deleted",
    "shipments.v1.event.added", "shipments.v1.event.updated", "shipments.v1.event.removed",
    "shipments.v1.state.added", "shipments.v1.state.updated", "shipments.v1.state.removed",
    "shipments.v1.exception.addedOrUpdated",
]


def sample_payload(event_type="shipments.v1.event.added"):
    return {
        "eventId": "333d2a1b-d332-4775-8f8e-960e5f538431",
        "eventType": event_type,
        "createdDateTime": "2025-03-31T17:01:42.92601441Z",
        "dataType": "EventChange",
        "context": {"shipment": {"shipmentId": "ac694c91-e308-4329-9584-ee10acb937b3"}},
        "data": {},
    }


def send(headers=None, body=None, content_type="application/json", method="POST"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/project44",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestApiKeyVerification:
    def test_correct_value(self):
        res = send({"X-Api-Key": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send({"x-api-key": SECRET}).status_code == 200

    def test_wrong_value_same_length(self):
        assert send({"X-Api-Key": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert send({"X-Api-Key": "short"}).status_code == 401

    def test_missing_header(self):
        assert send().status_code == 401

    def test_bearer_prefix_is_not_parsed(self):
        assert send({"X-Api-Key": f"Bearer {SECRET}"}).status_code == 401

    def test_secret_with_bearer_prefix_requires_it(self):
        env = {"PROJECT44_WEBHOOK_SECRET": "Bearer abc123"}
        assert verify_project44_request({"X-Api-Key": "Bearer abc123"}, env) is True
        assert verify_project44_request({"X-Api-Key": "abc123"}, env) is False

    def test_custom_header_name(self):
        env = {"PROJECT44_WEBHOOK_SECRET": SECRET, "PROJECT44_WEBHOOK_HEADER": "X-Project44-Key"}
        assert verify_project44_request({"X-Project44-Key": SECRET}, env) is True
        assert verify_project44_request({"X-Api-Key": SECRET}, env) is False

    def test_non_ascii_values_do_not_raise(self):
        env = {"PROJECT44_WEBHOOK_SECRET": "sécret-€"}
        assert verify_project44_request({"X-Api-Key": "sécret-€"}, env) is True
        assert verify_project44_request({"X-Api-Key": "secret"}, env) is False

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_project44_request({"X-Api-Key": SECRET}, {}) is False
        assert verify_project44_request({"X-Api-Key": ""}, {"PROJECT44_WEBHOOK_SECRET": ""}) is False


class TestMethodsAndBody:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_method(self, method):
        assert send({"X-Api-Key": SECRET}, method=method).status_code == 200

    def test_get_with_empty_body(self):
        res = client.get("/webhooks/project44", headers={"X-Api-Key": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_get_without_header(self):
        assert client.get("/webhooks/project44").status_code == 401

    def test_other_methods_not_allowed(self):
        res = client.delete("/webhooks/project44", headers={"X-Api-Key": SECRET})
        assert res.status_code == 405

    def test_any_content_type(self):
        assert send({"X-Api-Key": SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert send({"X-Api-Key": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert send({"X-Api-Key": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert send(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = send({"X-Api-Key": SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self, capsys):
        res = send({"X-Api-Key": SECRET}, body=json.dumps(sample_payload("shipments.v1.something.new")))
        assert res.status_code == 200
        assert "Unhandled" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
