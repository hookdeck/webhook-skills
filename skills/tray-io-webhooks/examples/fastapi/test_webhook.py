import json
import os

# Set test environment variables before importing the app
os.environ["TRAY_IO_WEBHOOK_HEADER"] = "X-Tray-Secret"
os.environ["TRAY_IO_WEBHOOK_SECRET"] = "Bearer test_tray_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_tray_request

client = TestClient(app)

HEADER = os.environ["TRAY_IO_WEBHOOK_HEADER"]
SECRET = os.environ["TRAY_IO_WEBHOOK_SECRET"]

EVENTS = ["record.created", "record.updated", "record.deleted"]


def sample_payload(event="record.created"):
    return {"event": event, "data": {"id": "rec_123", "name": "Acme"}}


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/tray-io",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_correct_value(self):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={HEADER.lower(): SECRET}).status_code == 200

    def test_does_not_strip_bearer_prefix(self):
        assert send(headers={HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert send(headers={HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert send(headers={HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert send().status_code == 401

    def test_other_header_is_not_checked(self):
        assert send(headers={"Authorization": SECRET}).status_code == 401

    def test_unconfigured_secret_rejects(self):
        assert verify_tray_request(Headers({HEADER: SECRET}), HEADER, "") is False

    def test_default_authorization_header(self):
        assert verify_tray_request(Headers({"authorization": "abc"}), "Authorization", "abc") is True
        assert verify_tray_request(Headers({"authorization": "abd"}), "Authorization", "abc") is False

    def test_non_ascii_secret_does_not_raise(self):
        secret = "sécret-ünïcode"
        sent = secret.encode("utf-8").decode("latin-1")  # how Starlette exposes header bytes
        assert verify_tray_request(Headers({"authorization": sent}), "Authorization", secret) is True
        assert verify_tray_request(Headers({"authorization": "plain-ascii"}), "Authorization", secret) is False


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_methods_with_body(self, method):
        assert send(method, headers={HEADER: SECRET}).status_code == 200

    def test_get_with_empty_body(self):
        res = client.get("/webhooks/tray-io", headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_unauthenticated_get(self):
        assert client.get("/webhooks/tray-io").status_code == 401

    def test_post_with_empty_body(self):
        assert send(headers={HEADER: SECRET}, body="").status_code == 200


class TestEvents:
    @pytest.mark.parametrize("event", EVENTS)
    def test_events(self, event):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200

    def test_unknown_event(self):
        res = send(headers={HEADER: SECRET}, body=json.dumps({"event": "custom.thing"}))
        assert res.status_code == 200

    def test_any_content_type_with_json_body(self):
        assert send(headers={HEADER: SECRET}, content_type="text/plain").status_code == 200


class TestBodyValidation:
    def test_invalid_json(self):
        assert send(headers={HEADER: SECRET}, body="not json").status_code == 400

    def test_form_encoded_body(self):
        res = send(headers={HEADER: SECRET}, body="a=1", content_type="application/x-www-form-urlencoded")
        assert res.status_code == 400

    def test_json_array(self):
        assert send(headers={HEADER: SECRET}, body="[]").status_code == 400

    def test_authenticates_before_parsing(self):
        assert send(headers={HEADER: "wrong"}, body="not json").status_code == 401


def test_health():
    assert client.get("/health").status_code == 200
