import base64
import json
import os

# Set test environment variables before importing the app
os.environ["WORKSPACE_ONE_WEBHOOK_USERNAME"] = "ws1-notify"
os.environ["WORKSPACE_ONE_WEBHOOK_PASSWORD"] = "p@ss:word-with-colon"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_workspace_one_request

client = TestClient(app)

USER = os.environ["WORKSPACE_ONE_WEBHOOK_USERNAME"]
PASS = os.environ["WORKSPACE_ONE_WEBHOOK_PASSWORD"]

EVENTS = [
    "Check-in/Check-out", "Device Attribute Change", "Device Compliance Status Change",
    "Device Compromised Status Change", "Device Delete", "Device Enrollment",
    "Device Unenrolled Enterprise Wipe", "Device Wipe",
]


def basic(user, password, scheme="Basic"):
    return f"{scheme} " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()


# Illustrative body: Omnissa's page does not document the payload.
def sample_payload(event_type="Device Enrollment"):
    return {"EventType": event_type, "DeviceId": 4821, "EnrollmentUserName": "jdoe"}


def post(auth=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    headers = {"Content-Type": content_type}
    if auth is not None:
        headers["Authorization"] = auth
    return client.post("/webhooks/workspace-one", content=content, headers=headers)


class TestBasicAuthVerification:
    def test_accepts_correct_credentials(self):
        res = post(basic(USER, PASS))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_case_insensitive_scheme_and_splits_on_first_colon(self):
        assert post(basic(USER, PASS, scheme="bAsIc")).status_code == 200

    def test_rejects_wrong_password(self):
        assert post(basic(USER, "wrong")).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(basic("someone-else", PASS)).status_code == 401

    def test_rejects_password_truncated_at_first_colon(self):
        assert post(basic(USER, PASS.split(":")[0])).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(f"Bearer {PASS}").status_code == 401

    def test_rejects_malformed_base64_and_missing_colon(self):
        assert post("Basic !!!not-base64!!!").status_code == 401
        no_colon = "Basic " + base64.b64encode(b"justausername").decode()
        assert post(no_colon).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        assert post(basic("usér", "pässwörd")).status_code == 401

    def test_rejects_when_unconfigured(self):
        headers = {"authorization": basic(USER, PASS)}
        assert verify_workspace_one_request(headers, "", "") is False
        assert verify_workspace_one_request({"authorization": basic("", "")}, "", "") is False


class TestBodyHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type):
        res = post(basic(USER, PASS), json.dumps(sample_payload(event_type)))
        assert res.status_code == 200

    def test_accepts_unknown_event_type(self):
        assert post(basic(USER, PASS), json.dumps(sample_payload("Something New"))).status_code == 200

    def test_accepts_xml_body(self):
        xml = "<Event><EventType>Device Wipe</EventType><DeviceId>4821</DeviceId></Event>"
        assert post(basic(USER, PASS), xml, "application/xml").status_code == 200

    def test_accepts_any_content_type(self):
        res = post(basic(USER, PASS), json.dumps(sample_payload()), "text/plain")
        assert res.status_code == 200

    def test_rejects_invalid_json_after_auth(self):
        assert post(basic(USER, PASS), "{not json").status_code == 400

    def test_rejects_non_object_json(self):
        assert post(basic(USER, PASS), "[1,2]").status_code == 400

    def test_unauthenticated_invalid_body_is_401(self):
        assert post(None, "{not json").status_code == 401
