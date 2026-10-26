import json
import os

import pytest

# Set test environment variables before importing the app
SECRET = "Bearer my-secret-token"
os.environ["ESTUARY_WEBHOOK_SECRET"] = SECRET
os.environ.pop("ESTUARY_WEBHOOK_HEADER", None)  # default: Authorization

from fastapi.testclient import TestClient

from main import app, classify, verify_estuary_request

client = TestClient(app)

# ILLUSTRATIVE payloads: Estuary has no fixed event schema. A trigger body is the
# author's payloadTemplate; these use the documented template variables.
TRIGGER = {
    "materialization_name": "acmeCo/orders/to-warehouse",
    "collection_names": ["acmeCo/orders"],
    "run_id": "run-0001",
}
DOCUMENT = {"id": 42, "status": "shipped"}


def send(method, body=None, headers=None, content_type="application/json"):
    hdrs = dict(headers or {})
    kwargs = {}
    if body is not None:
        hdrs["Content-Type"] = content_type
        kwargs["content"] = body
    return client.request(method, "/webhooks/estuary", headers=hdrs, **kwargs)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("ESTUARY_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("ESTUARY_WEBHOOK_HEADER", raising=False)


class TestEstuaryWebhook:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_whole_authorization_value(self, method):
        res = send(method, json.dumps(TRIGGER), {"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_accepts_empty_body(self, method):
        assert send(method, headers={"Authorization": SECRET}).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
    def test_rejects_missing_header(self, method):
        assert send(method, json.dumps(TRIGGER)).status_code == 401

    def test_rejects_wrong_value(self):
        assert send("POST", json.dumps(TRIGGER), {"Authorization": "Bearer nope"}).status_code == 401

    def test_does_not_strip_bearer_prefix(self):
        assert send("POST", json.dumps(TRIGGER), {"Authorization": "my-secret-token"}).status_code == 401

    def test_rejects_longer_value_with_secret_prefix(self):
        assert send("POST", json.dumps(TRIGGER), {"Authorization": SECRET + "x"}).status_code == 401

    def test_header_name_from_env_is_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("ESTUARY_WEBHOOK_HEADER", "X-Estuary-Secret")
        assert send("POST", json.dumps(TRIGGER), {"x-estuary-secret": SECRET}).status_code == 200
        assert send("POST", json.dumps(TRIGGER), {"Authorization": SECRET}).status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = send("POST", json.dumps(DOCUMENT), {"Authorization": SECRET}, "text/plain")
        assert res.status_code == 200

    def test_accepts_non_json_body_once_authenticated(self):
        assert send("POST", "plain text", {"Authorization": SECRET}, "text/plain").status_code == 200


class TestHelpers:
    def test_classify(self):
        assert classify(TRIGGER) == "trigger"
        assert classify(DOCUMENT) == "document"
        assert classify(None) == "empty"

    def test_never_accepts_when_unconfigured(self):
        assert verify_estuary_request({"authorization": "x"}, {}) is False
        assert verify_estuary_request({"authorization": ""}, {"ESTUARY_WEBHOOK_SECRET": ""}) is False

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_estuary_request({"Authorization": "x"}, {"ESTUARY_WEBHOOK_SECRET": "sécret"}) is False
