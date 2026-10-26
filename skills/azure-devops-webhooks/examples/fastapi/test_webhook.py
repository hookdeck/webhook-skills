import base64
import json
import os

# Set test environment variables before importing the app
os.environ["AZURE_DEVOPS_WEBHOOK_USERNAME"] = "ado-hook-user"
os.environ["AZURE_DEVOPS_WEBHOOK_PASSWORD"] = "p@ss:word/with:colons"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, safe_equal, verify_azure_devops_request

client = TestClient(app)

USER = os.environ["AZURE_DEVOPS_WEBHOOK_USERNAME"]
PASS = os.environ["AZURE_DEVOPS_WEBHOOK_PASSWORD"]

EVENTS = [
    "git.push", "git.pullrequest.created", "git.pullrequest.updated", "git.pullrequest.merged",
    "workitem.created", "workitem.updated", "workitem.commented", "build.complete",
    "ms.vss-pipelines.run-state-changed-event",
]


def basic(user, password, scheme="Basic"):
    return f"{scheme} {base64.b64encode(f'{user}:{password}'.encode()).decode()}"


def sample_payload(event_type="git.push"):
    return {
        "subscriptionId": "00000000-0000-0000-0000-000000000000",
        "notificationId": 1,
        "id": "a0a0a0a0-bbbb-cccc-dddd-e1e1e1e1e1e1",
        "eventType": event_type,
        "publisherId": "tfs",
        "message": {"text": "Jamal Hartnett pushed updates to branch main.", "html": "", "markdown": ""},
        "detailedMessage": {"text": "", "html": "", "markdown": ""},
        "resource": {"pushId": 14},
        "resourceVersion": "1.0",
        "resourceContainers": {"project": {"id": "00aa00aa-bb11-cc22-dd33-44ee44ee44ee"}},
        "createdDate": "2024-09-19T13:03:27.0379153Z",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/azure-devops",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBasicAuthentication:
    def test_correct_credentials(self):
        res = post({"Authorization": basic(USER, PASS)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post({"Authorization": basic(USER, PASS, "bAsIc")}).status_code == 200

    def test_splits_on_first_colon_only(self):
        assert parse_basic_auth(basic("user", "a:b:c")) == (b"user", b"a:b:c")

    def test_wrong_password(self):
        assert post({"Authorization": basic(USER, "wrong")}).status_code == 401

    def test_wrong_username(self):
        assert post({"Authorization": basic("someone-else", PASS)}).status_code == 401

    def test_both_wrong(self):
        assert post({"Authorization": basic("x", "y")}).status_code == 401

    def test_different_length_values(self):
        assert post({"Authorization": basic("u", "p")}).status_code == 401

    def test_missing_header(self):
        res = post()
        assert res.status_code == 401
        assert res.headers["www-authenticate"].startswith("Basic")

    def test_non_basic_scheme(self):
        assert post({"Authorization": f"Bearer {PASS}"}).status_code == 401

    def test_invalid_base64(self):
        assert post({"Authorization": "Basic !!!not-base64!!!"}).status_code == 401

    def test_trailing_junk_after_base64(self):
        assert post({"Authorization": f"{basic(USER, PASS)} extra"}).status_code == 401

    def test_no_colon(self):
        header = "Basic " + base64.b64encode(b"nocolon").decode()
        assert post({"Authorization": header}).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        assert post({"Authorization": basic("üser", "pässwörd")}).status_code == 401

    def test_non_ascii_configured_credentials(self):
        header = {"authorization": basic("üser", "pässwörd")}
        assert verify_azure_devops_request(header, "üser", "pässwörd") is True
        assert verify_azure_devops_request(header, "üser", "other") is False

    def test_fails_closed_when_unconfigured(self):
        assert verify_azure_devops_request({"authorization": basic("", "")}, "", "") is False

    def test_rejects_every_request_when_env_unset(self, monkeypatch):
        monkeypatch.delenv("AZURE_DEVOPS_WEBHOOK_USERNAME")
        monkeypatch.delenv("AZURE_DEVOPS_WEBHOOK_PASSWORD")
        assert post({"Authorization": basic(USER, PASS)}).status_code == 401

    def test_safe_equal_takes_bytes(self):
        assert safe_equal(b"abc", b"abc") is True
        assert safe_equal(b"abc", b"abcd") is False
        assert safe_equal("é".encode(), "é".encode()) is True


class TestBodyHandling:
    def test_authenticates_before_parsing(self):
        res = post({"Authorization": basic(USER, "wrong")}, body="not json")
        assert res.status_code == 401

    def test_any_content_type(self):
        res = post({"Authorization": basic(USER, PASS)}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        res = post({"Authorization": basic(USER, PASS)}, body='{"eventType": ')
        assert res.status_code == 400

    def test_two_concatenated_objects_rejected(self):
        one = json.dumps(sample_payload("build.complete"))
        res = post({"Authorization": basic(USER, PASS)}, body=one + one)
        assert res.status_code == 400

    def test_json_array_rejected(self):
        assert post({"Authorization": basic(USER, PASS)}, body="[]").status_code == 400


class TestEvents:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type):
        res = post({"Authorization": basic(USER, PASS)}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200

    def test_unknown_event_accepted(self):
        res = post({"Authorization": basic(USER, PASS)}, body=json.dumps(sample_payload("tfvc.checkin")))
        assert res.status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
