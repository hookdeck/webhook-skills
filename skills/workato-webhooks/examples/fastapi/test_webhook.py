import base64
import json
import os

# Set test environment variables before importing the app
os.environ["WORKATO_WEBHOOK_USERNAME"] = "workato"
os.environ["WORKATO_WEBHOOK_PASSWORD"] = "test_workato_password:with-colon"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_workato_request

client = TestClient(app)

USER = os.environ["WORKATO_WEBHOOK_USERNAME"]
PASSWORD = os.environ["WORKATO_WEBHOOK_PASSWORD"]


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


GOOD = basic(USER, PASSWORD)


def sample_payload(event="order.created"):
    """What a Workato HTTP action would send (the body is whatever the recipe builds)."""
    return {
        "event": event,
        "data": {"order_id": "ord_123", "record_id": "rec_9", "recipe_name": "Orders sync", "error": "timeout"},
    }


def send(method="POST", auth=GOOD, body="default", content_type="application/json"):
    headers = {}
    if auth:
        headers["Authorization"] = auth
    if body == "default":
        body = json.dumps(sample_payload())
    kwargs = {}
    if body is not None:
        headers["Content-Type"] = content_type
        kwargs["content"] = body
    return client.request(method, "/webhooks/workato", headers=headers, **kwargs)


class TestBasicAuth:
    def test_correct_credentials_password_with_colon(self):
        res = send()
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert send(auth="basic " + GOOD[6:]).status_code == 200

    def test_wrong_password_same_length(self):
        assert send(auth=basic(USER, "x" * len(PASSWORD))).status_code == 401

    def test_wrong_password_different_length(self):
        assert send(auth=basic(USER, "short")).status_code == 401

    def test_wrong_username(self):
        assert send(auth=basic("admin", PASSWORD)).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        assert send(auth=basic("wörkato", "pässword")).status_code == 401

    def test_missing_header(self):
        assert send(auth=None).status_code == 401

    def test_non_basic_scheme(self):
        assert send(auth="Bearer " + PASSWORD).status_code == 401

    def test_malformed_base64(self):
        assert send(auth="Basic !!!not-base64").status_code == 401

    def test_no_colon_after_decoding(self):
        assert send(auth="Basic " + base64.b64encode(b"nocolon").decode()).status_code == 401


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_methods_with_json_body(self, method):
        assert send(method).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_methods_with_no_body(self, method):
        res = send(method, body=None)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_get_still_authenticates(self):
        assert send("GET", auth=None, body=None).status_code == 401


class TestBodyHandling:
    def test_any_content_type(self):
        assert send(content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert send(body="{not json").status_code == 400

    def test_non_object_json(self):
        assert send(body="[1,2,3]").status_code == 400

    def test_bad_body_without_credentials_is_401(self):
        assert send(auth=None, body="{not json").status_code == 401

    @pytest.mark.parametrize("event", ["order.created", "record.updated", "recipe.failed", "something.else"])
    def test_handles_events(self, event):
        assert send(body=json.dumps(sample_payload(event))).status_code == 200


class TestVerifyWorkatoRequest:
    def test_rejects_when_not_configured(self):
        assert verify_workato_request({"authorization": basic("", "")}, {}) is False
        assert verify_workato_request({"authorization": GOOD}, {"WORKATO_WEBHOOK_USERNAME": USER}) is False


class TestHealth:
    def test_health(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
