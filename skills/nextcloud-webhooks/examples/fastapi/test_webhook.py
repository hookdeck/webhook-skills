import json
import os

# Set test environment variables before importing the app
os.environ["NEXTCLOUD_WEBHOOK_HEADER"] = "Authorization"
os.environ["NEXTCLOUD_WEBHOOK_SECRET"] = "Bearer test_nextcloud_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_nextcloud_request

client = TestClient(app)

HEADER = os.environ["NEXTCLOUD_WEBHOOK_HEADER"]
SECRET = os.environ["NEXTCLOUD_WEBHOOK_SECRET"]

EVENTS = [
    "OCP\\Files\\Events\\Node\\NodeCreatedEvent",
    "OCP\\Files\\Events\\Node\\NodeWrittenEvent",
    "OCP\\Files\\Events\\Node\\NodeTouchedEvent",
    "OCP\\Files\\Events\\Node\\NodeDeletedEvent",
    "OCP\\Files\\Events\\Node\\NodeCopiedEvent",
    "OCP\\Files\\Events\\Node\\NodeRenamedEvent",
    "OCP\\Files\\Events\\Node\\NodeRestoredEvent",
    "OCP\\SystemTag\\TagAssignedEvent",
    "OCP\\SystemTag\\TagUnassignedEvent",
    "OCP\\Calendar\\Events\\CalendarObjectCreatedEvent",
    "OCP\\Calendar\\Events\\CalendarObjectUpdatedEvent",
    "OCP\\Calendar\\Events\\CalendarObjectDeletedEvent",
    "OCA\\Forms\\Events\\FormSubmittedEvent",
]


def sample_payload(cls=EVENTS[0]):
    return {
        "event": {
            "class": cls,
            "node": {"id": 437, "path": "/admin/files/test-webhook.txt"},
            "source": {"id": 399, "path": "/admin/files/a.txt"},
            "target": {"id": 437, "path": "/admin/files/b.txt"},
            "calendarId": 1,
        },
        "user": {"uid": "admin", "displayName": "Admin"},
        "time": 1700100000,
    }


def send(method="POST", headers=None, body=None, content_type="application/json"):
    """body=None sends the sample payload; body=b'' sends an empty body."""
    content = json.dumps(sample_payload()) if body is None else body
    return client.request(
        method,
        "/webhooks/nextcloud",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_the_correct_whole_header_value(self):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_header_name_case_insensitively(self):
        assert send(headers={"authorization": SECRET}).status_code == 200

    def test_compares_whole_value_bare_token_is_rejected(self):
        res = send(headers={HEADER: "test_nextcloud_secret_0123456789"})
        assert res.status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert send(headers={HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert send(headers={HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_non_ascii_values_do_not_raise(self):
        assert verify_nextcloud_request(Headers({"authorization": "café"}), "Bearer café") is False
        assert verify_nextcloud_request(Headers({"authorization": "café"}), "café") is True

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        headers = Headers({"authorization": SECRET})
        assert verify_nextcloud_request(headers, "") is False
        monkeypatch.delenv("NEXTCLOUD_WEBHOOK_SECRET")
        assert verify_nextcloud_request(headers) is False

    def test_reads_custom_header_name_from_env(self, monkeypatch):
        monkeypatch.setenv("NEXTCLOUD_WEBHOOK_HEADER", "X-Nextcloud-Secret")
        assert send(headers={"X-Nextcloud-Secret": SECRET}).status_code == 200
        assert send(headers={"Authorization": SECRET}).status_code == 401

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("NEXTCLOUD_WEBHOOK_HEADER")
        assert verify_nextcloud_request(Headers({"authorization": SECRET})) is True


class TestHttpMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_method_with_body(self, method):
        assert send(method, headers={HEADER: SECRET}).status_code == 200

    def test_accepts_get_with_no_body(self):
        res = client.get("/webhooks/nextcloud", headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "GET", "DELETE"])
    def test_rejects_method_without_credential(self, method):
        assert send(method).status_code == 401

    def test_other_methods_return_405(self):
        assert client.options("/webhooks/nextcloud").status_code == 405


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = send(headers={HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_acknowledges_empty_body(self):
        assert send(headers={HEADER: SECRET}, body=b"").status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert send(headers={HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert send(headers={HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_returns_401(self):
        assert send(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("cls", EVENTS)
    def test_handles_event(self, cls, capsys):
        res = send(headers={HEADER: SECRET}, body=json.dumps(sample_payload(cls)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_handles_deleted_node_without_id_and_null_user(self):
        body = {"event": {"class": EVENTS[3], "node": {"path": "/user/files/old.txt"}}, "user": None, "time": 1}
        assert send(headers={HEADER: SECRET}, body=json.dumps(body)).status_code == 200

    @pytest.mark.parametrize("event", ["NodeCreatedEvent", 42, None, ["x"]])
    def test_tolerates_non_object_event_field(self, event):
        body = {"event": event, "user": "alice", "time": 1}
        assert send(headers={HEADER: SECRET}, body=json.dumps(body)).status_code == 200

    def test_acknowledges_unknown_events(self):
        body = json.dumps(sample_payload("OCA\\Mail\\Event\\NewMessageReceivedEvent"))
        assert send(headers={HEADER: SECRET}, body=body).status_code == 200


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
