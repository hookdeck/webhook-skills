import base64
import json
import os

# Set test environment variables before importing the app
os.environ["FOURKITES_WEBHOOK_USERNAME"] = "fk_user"
os.environ["FOURKITES_WEBHOOK_PASSWORD"] = "p@ss:word/with:colons"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_fourkites_request

client = TestClient(app)

USER = os.environ["FOURKITES_WEBHOOK_USERNAME"]
PASS = os.environ["FOURKITES_WEBHOOK_PASSWORD"]

EVENTS = [
    "LOAD_CREATION",
    "LOCATION_UPDATE",
    "TRACKING_UPDATE",
    "STOP_ETA_UPDATED",
    "STOP_ARRIVAL",
    "STOP_DEPARTURE",
    "STOP_AUTO_COMPLETED",
    "MANUALLY_DELIVERED",
    "MANUALLY_PICKED_UP",
    "STOP_APPOINTMENT_RESCHEDULED",
    "STOP_AMEND",
    "LOAD_DELETED",
]


def basic(user, password, scheme="Basic"):
    return f"{scheme} " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()


def sample_payload(mtype="STOP_ARRIVAL"):
    return {
        "MessageType": mtype,
        "FourKitesLoadId": 1234,
        "LoadNumber": "BOL12345",
        "StopName": "ABC Stop",
        "Timestamp": "2015-10-01T16:00:00-05:00",
    }


def post(auth=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    headers = {"Content-Type": content_type}
    if auth is not None:
        headers["Authorization"] = auth
    return client.post("/webhooks/fourkites", content=content, headers=headers)


class TestBasicAuthVerification:
    def test_accepts_correct_credentials(self):
        res = post(basic(USER, PASS))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post(basic(USER, PASS, "basic")).status_code == 200

    def test_password_may_contain_colons(self):
        assert ":" in PASS
        assert post(basic(USER, PASS)).status_code == 200

    def test_rejects_wrong_password_same_length(self):
        assert post(basic(USER, "x" * len(PASS))).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(basic("other", PASS)).status_code == 401

    def test_rejects_different_length_without_raising(self):
        assert post(basic("u", "p")).status_code == 401

    def test_accepts_non_ascii_credentials_safely(self):
        # compare_digest on str would raise TypeError for non-ASCII; bytes must not.
        assert post(basic("üser", "pässwörd")).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(f"Bearer {PASS}").status_code == 401

    def test_rejects_value_without_colon(self):
        assert post("Basic " + base64.b64encode(b"nocolon").decode()).status_code == 401

    def test_rejects_invalid_base64(self):
        assert post("Basic !!!not-base64!!!").status_code == 401

    def test_fails_closed_when_unconfigured(self):
        headers = {"authorization": basic(USER, PASS)}
        assert verify_fourkites_request(headers, "", "") is False
        assert verify_fourkites_request({"authorization": basic("", "")}, "", "") is False


class TestEvents:
    @pytest.mark.parametrize("mtype", EVENTS)
    def test_handles_event(self, mtype):
        assert post(basic(USER, PASS), json.dumps(sample_payload(mtype))).status_code == 200

    def test_accepts_unknown_message_type(self):
        assert post(basic(USER, PASS), json.dumps(sample_payload("SOMETHING_NEW"))).status_code == 200


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post(basic(USER, PASS), json.dumps(sample_payload()), "text/plain")
        assert res.status_code == 200

    def test_authenticates_before_parsing(self):
        assert post(basic(USER, "wrong"), "{not json").status_code == 401

    def test_rejects_invalid_json(self):
        assert post(basic(USER, PASS), "{not json").status_code == 400

    def test_rejects_non_object(self):
        assert post(basic(USER, PASS), "[1,2]").status_code == 400
