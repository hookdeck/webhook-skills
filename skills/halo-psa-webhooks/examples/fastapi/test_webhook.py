import base64
import json
import os

USER = "halo-webhook"
PASSWORD = "test_halo_password:with:colons"

# Set test environment variables before importing the app
os.environ["HALO_PSA_WEBHOOK_USERNAME"] = USER
os.environ["HALO_PSA_WEBHOOK_PASSWORD"] = PASSWORD

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_halo_psa_request

client = TestClient(app)


def sample_payload(event="New Ticket Logged"):
    """Illustrative: Halo's docs don't spell out the property names."""
    return {"id": 1, "event": event, "object_id": 4021, "timestamp": "2026-10-25T10:00:00Z"}


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()


def post(body=None, auth=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    headers = {"Content-Type": content_type}
    if auth is not None:
        headers["Authorization"] = auth
    return client.post("/webhooks/halo-psa", content=body, headers=headers)


class TestBasicAuth:
    def test_accepts_correct_credentials(self):
        res = post(auth=basic(USER, PASSWORD))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        res = post(auth=basic(USER, PASSWORD).replace("Basic", "bAsIc"))
        assert res.status_code == 200

    def test_splits_on_first_colon(self):
        assert parse_basic_auth(basic("u", "a:b:c")) == ("u", "a:b:c")

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_password_same_length(self):
        assert post(auth=basic(USER, "x" * len(PASSWORD))).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(auth=basic("someone-else", PASSWORD)).status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(auth="Bearer " + PASSWORD).status_code == 401

    def test_rejects_credentials_without_colon(self):
        value = "Basic " + base64.b64encode(b"halo-webhook").decode()
        assert post(auth=value).status_code == 401

    @pytest.mark.parametrize("suffix", ["=junk", " junk", "!!"])
    def test_rejects_valid_credentials_followed_by_junk(self, suffix):
        assert post(auth=basic(USER, PASSWORD) + suffix).status_code == 401

    def test_rejects_characters_outside_base64_alphabet(self):
        assert parse_basic_auth("Basic dXNlcjpwYXN-") is None
        assert parse_basic_auth("Basic dXNlcjpwYXNz=") is None  # length not a multiple of 4

    def test_rejects_invalid_utf8(self):
        value = "Basic " + base64.b64encode(b"user:" + bytes([0xFF, 0xFE, 0x41])).decode()
        assert parse_basic_auth(value) is None

    def test_rejects_when_unconfigured(self):
        assert verify_halo_psa_request({"authorization": basic("a", "b")}, {}) is False
        assert verify_halo_psa_request({"authorization": basic("", "")}, {}) is False

    def test_handles_non_ascii_credentials(self):
        config = {"HALO_PSA_WEBHOOK_USERNAME": "ünï", "HALO_PSA_WEBHOOK_PASSWORD": "pässwörd"}
        assert verify_halo_psa_request({"authorization": basic("ünï", "pässwörd")}, config) is True
        assert verify_halo_psa_request({"authorization": basic("ünï", "passwörd")}, config) is False

    def test_authenticates_before_parsing_body(self):
        assert post(body="not json").status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post(auth=basic(USER, PASSWORD), content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post(body="not json", auth=basic(USER, PASSWORD)).status_code == 400

    def test_scalar_returns_400(self):
        assert post(body='"hello"', auth=basic(USER, PASSWORD)).status_code == 400

    def test_batched_delivery(self):
        batch = [sample_payload("New Ticket Logged"), sample_payload("Ticket Reassigned")]
        assert post(body=json.dumps(batch), auth=basic(USER, PASSWORD)).status_code == 200

    def test_array_of_non_objects_returns_400(self):
        assert post(body="[1,2]", auth=basic(USER, PASSWORD)).status_code == 400


class TestEvents:
    @pytest.mark.parametrize(
        "event",
        [
            "New Ticket Logged",
            "Ticket Reassigned",
            "Document deleted on a Ticket",
            "Document edited on a Ticket",
        ],
    )
    def test_handles_event(self, event, capsys):
        res = post(body=json.dumps(sample_payload(event)), auth=basic(USER, PASSWORD))
        assert res.status_code == 200
        assert "Unhandled event" not in capsys.readouterr().out

    def test_acknowledges_unhandled_events(self):
        res = post(body=json.dumps(sample_payload("Something Else")), auth=basic(USER, PASSWORD))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
