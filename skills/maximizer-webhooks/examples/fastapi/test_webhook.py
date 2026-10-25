import json
import os

# Set test environment variables before importing the app
os.environ["MAXIMIZER_WEBHOOK_HEADER"] = "X-Maximizer-Auth"
os.environ["MAXIMIZER_WEBHOOK_SECRET"] = "Bearer test_maximizer_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_maximizer_request

client = TestClient(app)

HEADER = os.environ["MAXIMIZER_WEBHOOK_HEADER"]
SECRET = os.environ["MAXIMIZER_WEBHOOK_SECRET"]

EVENTS = [
    ("AbEntry", "Create"), ("AbEntry", "Update"), ("AbEntry", "Delete"),
    ("Opportunity", "Create"), ("Opportunity", "Update"), ("Opportunity", "Delete"),
    ("Lead", "Create"), ("Lead", "Update"), ("Lead", "Delete"),
]


def sample_webhook(entity="Opportunity", op="Update"):
    """Shape from https://developer.maximizer.com/docs/webhooks (an array; Op lives in Data)."""
    return {
        "Id": "d81f9d6e-8afc-4fa4-9052-2af207494e5d",
        "Timestamp": "2024-09-20T00:01:29.5149836Z",
        "ProcessedTimestamp": "2024-09-20T00:02:45.8974002Z",
        "WorkspaceId": "108F314C-6787-4EE6-BE49-C0E0C651F039",
        "SourceId": "1a0dde7c-743f-4b55-a2bf-e7738393a8e5",
        "Recipients": [],
        "Options": None,
        "Entity": entity,
        "Data": {
            "Op": op,
            "Original": None if op == "Create" else {"Key": "T3Bwb3J0dW5pdHkJMjQwOTE5"},
            "New": None if op == "Delete" else {"Key": "T3Bwb3J0dW5pdHkJMjQwOTE5", "Objective": "Test Opportunity"},
            "Version": "1.1",
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps([sample_webhook()])
    return client.post(
        "/webhooks/maximizer",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialHeader:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_is_compared_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        res = client.post(
            "/webhooks/maximizer",
            content=json.dumps([sample_webhook()]),
            headers={HEADER: "café".encode("utf-8")},
        )
        assert res.status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_in_other_header_is_rejected(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_default_header_name_is_authorization(self):
        assert verify_maximizer_request({"authorization": "Bearer abc"}, "Bearer abc", "Authorization") is True
        assert verify_maximizer_request({"authorization": "Bearer abc"}, "Bearer abc", "X-Other") is False

    def test_unconfigured_secret_rejects_everything(self):
        headers = {"x-maximizer-auth": SECRET}
        assert verify_maximizer_request(headers, secret="", header_name=HEADER) is False
        assert verify_maximizer_request(headers, secret=SECRET, header_name=HEADER) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_object_instead_of_array(self):
        assert post({HEADER: SECRET}, body=json.dumps(sample_webhook())).status_code == 400

    def test_array_of_non_objects(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert post(body="{not json").status_code == 401

    def test_empty_array(self):
        assert post({HEADER: SECRET}, body="[]").status_code == 200


class TestEventHandling:
    @pytest.mark.parametrize("entity,op", EVENTS)
    def test_handles_event(self, entity, op, capsys):
        res = post({HEADER: SECRET}, body=json.dumps([sample_webhook(entity, op)]))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_handles_every_webhook_in_a_batch(self, capsys):
        batch = [sample_webhook("AbEntry", "Create"), sample_webhook("Lead", "Delete")]
        res = post({HEADER: SECRET}, body=json.dumps(batch))
        assert res.status_code == 200
        out = capsys.readouterr().out
        assert "Contact created" in out and "Lead deleted" in out

    def test_lower_case_op(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps([sample_webhook("Lead", "create")]))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_entity_is_acknowledged(self):
        res = post({HEADER: SECRET}, body=json.dumps([sample_webhook("UnknownEntity", "Create")]))
        assert res.status_code == 200

    def test_handler_error_still_returns_200(self):
        res = post({HEADER: SECRET}, body=json.dumps([{"Entity": "AbEntry", "Data": None, "Op": "Create"}]))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
