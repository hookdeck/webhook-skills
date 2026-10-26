import json
import os

# Set test environment variables before importing the app
os.environ["SIGFOX_WEBHOOK_SECRET"] = "Bearer sigfox_test_secret_0123456789"
os.environ.pop("SIGFOX_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient

from main import app, classify_callback, verify_sigfox_request

client = TestClient(app)

SECRET = os.environ["SIGFOX_WEBHOOK_SECRET"]

UPLINK = {
    "device": "1A2B3C", "deviceTypeId": "5f3c8a1b", "time": 1700000000,
    "data": "0102030405", "seqNumber": 42,
}

CALLBACKS = {
    "data uplink": UPLINK,
    "data bidir": {**UPLINK, "longPolling": False, "ack": True},
    "data advanced": {**UPLINK, "lqi": "GOOD", "linkQuality": 2},
    "service status": {"device": "1A2B3C", "time": 1700000000, "batt": 2.9, "temp": 21.5},
    "service acknowledge": {"device": "1A2B3C", "time": 1700000000, "infoCode": 0, "downlinkAck": True},
    "service repeater": {"device": "1A2B3C", "time": 1700000000, "batt": 3.1, "repeatedMsg": 12},
    "error": {"device": "1A2B3C", "time": 1700000000, "info": "last message 2h ago", "severity": "ERROR"},
}


def post(headers=None, body=None, content_type="application/json", method="POST"):
    content = body if body is not None else json.dumps(UPLINK)
    return client.request(
        method,
        "/webhooks/sigfox",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_correct_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": "data uplink"}

    def test_header_lookup_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_compares_whole_value_not_stripped_bearer(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_value_of_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_non_ascii_does_not_raise(self):
        # compare_digest raises TypeError for non-ASCII str; the check encodes to bytes.
        assert verify_sigfox_request({"Authorization": "café-secret"}, SECRET) is False
        assert verify_sigfox_request({"Authorization": SECRET}, "café-secret") is False
        assert verify_sigfox_request({"Authorization": "café"}, "café") is True

    def test_custom_header_name(self, monkeypatch):
        monkeypatch.setenv("SIGFOX_WEBHOOK_HEADER", "X-Sigfox-Token")
        assert post({"X-Sigfox-Token": SECRET}).status_code == 200
        assert post({"x-sigfox-token": SECRET}).status_code == 200
        assert post({"Authorization": SECRET}).status_code == 401

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        assert verify_sigfox_request({"Authorization": SECRET}, "") is False
        monkeypatch.delenv("SIGFOX_WEBHOOK_SECRET")
        assert verify_sigfox_request({"Authorization": SECRET}) is False
        assert post({"Authorization": SECRET}).status_code == 401


class TestMethodsAndBodies:
    def test_get_with_query_string_and_no_body(self):
        res = client.get(
            "/webhooks/sigfox",
            params={"device": "1A2B3C", "data": "0102030405", "time": "1700000000"},
            headers={"Authorization": SECRET},
        )
        assert res.status_code == 200
        assert res.json()["type"] == "data uplink"

    def test_get_without_credential(self):
        assert client.get("/webhooks/sigfox", params={"device": "1A2B3C", "data": "01"}).status_code == 401

    def test_put_with_json_body(self):
        assert post({"Authorization": SECRET}, method="PUT").status_code == 200

    def test_form_encoded_post(self):
        res = post(
            {"Authorization": SECRET},
            body="device=1A2B3C&data=0102030405&time=1700000000",
            content_type="application/x-www-form-urlencoded",
        )
        assert res.status_code == 200
        assert res.json()["type"] == "data uplink"

    def test_any_content_type(self):
        assert post({"Authorization": SECRET}, content_type="text/plain").status_code == 200

    def test_empty_post_body(self):
        res = client.post("/webhooks/sigfox", headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json()["type"] == "unknown"

    def test_invalid_json_after_auth(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_json_array(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert post(body="{not json").status_code == 401

    def test_other_methods_not_allowed(self):
        res = client.delete("/webhooks/sigfox", headers={"Authorization": SECRET})
        assert res.status_code == 405


class TestCallbackTypes:
    @pytest.mark.parametrize("callback_type,payload", list(CALLBACKS.items()))
    def test_handles_type(self, callback_type, payload):
        assert classify_callback(payload) == callback_type
        res = post({"Authorization": SECRET}, body=json.dumps(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": callback_type}


def test_health():
    assert client.get("/health").status_code == 200
