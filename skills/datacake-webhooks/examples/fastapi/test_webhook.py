import json
import os

# Set test environment variables before importing the app.
# The secret is the exact, whole header value, including the "Bearer " the user typed in Datacake.
os.environ["DATACAKE_WEBHOOK_HEADER"] = "Authorization"
os.environ["DATACAKE_WEBHOOK_SECRET"] = "Bearer test_datacake_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_datacake_request

client = TestClient(app)

SECRET = os.environ["DATACAKE_WEBHOOK_SECRET"]

# Payloads follow the samples in Datacake's outgoing webhook docs.
PAYLOADS = {
    "device_measurement": {
        "data": [
            {"field": "TEMPERATURE", "value": 19.141228, "device": "f7384fd1-9e7f-4540-b4ed-5fa5810bcc27", "timestamp": 1647852981},
            {"field": "HUMIDITY", "value": 66.95572, "device": "f7384fd1-9e7f-4540-b4ed-5fa5810bcc27", "timestamp": 1647852981},
            {"field": "ORIENTATION", "value": "", "device": "f7384fd1-9e7f-4540-b4ed-5fa5810bcc27", "timestamp": 1647852980},
        ],
        "event": "device_measurement",
    },
    "decoder_output": {
        "data": {
            "log": None,
            "device": None,
            "result": [
                {"field": "TOWER_LOCATION", "value": "(34.492523,136.171631)", "device": "dev:864475044240892"},
                {"field": "RSSI", "device": "dev:864475044240892"},
                {"field": "PM25", "value": 4.88, "device": "dev:864475044240892"},
            ],
            "product": "ef6275c7-3e9b-4134-9bef-24bc276a9592",
            "execution_time": 664535,
        },
        "event": "decoder_output",
    },
    "downlink": {
        "data": {
            "meta": {"type": "lorawan", "fport": 1, "downlink": "a6895656-8198-41fe-9c0e-f49074311190"},
            "device": "a52e6324-2cf9-4534-b523-819d94299414",
            "payload": "AQI=",
            "product_id": "4e8e8623-18c4-4798-9877-699058a00e24",
            "product_slug": "temperatur-dach",
        },
        "event": "downlink",
    },
}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PAYLOADS["device_measurement"])
    return client.post(
        "/webhooks/datacake",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_exact_header_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_header_name_case_insensitively(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_compares_whole_value_and_does_not_strip_bearer(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_empty_header_value(self):
        assert post({"Authorization": ""}).status_code == 401

    def test_authenticates_before_parsing_body(self):
        assert post(body="not json").status_code == 401


class TestVerifyDatacakeRequest:
    def test_reads_custom_header_name(self):
        assert verify_datacake_request(Headers({"x-datacake-token": "abc123"}), "X-Datacake-Token", "abc123") is True
        assert verify_datacake_request(Headers({"authorization": "abc123"}), "X-Datacake-Token", "abc123") is False

    def test_defaults_header_name_to_authorization(self, monkeypatch):
        monkeypatch.delenv("DATACAKE_WEBHOOK_HEADER")
        assert verify_datacake_request(Headers({"authorization": SECRET})) is True

    def test_fails_closed_when_no_secret_configured(self):
        assert verify_datacake_request(Headers({"authorization": "anything"}), "Authorization", "") is False

    def test_handles_non_ascii_secrets_without_raising(self):
        secret = "Bearer sécret-ü"
        sent = secret.encode("utf-8").decode("latin-1")  # how header bytes arrive
        assert verify_datacake_request(Headers({"authorization": sent}), "Authorization", secret) is True
        assert verify_datacake_request(Headers({"authorization": "Bearer secret-u"}), "Authorization", secret) is False


class TestEventHandling:
    @pytest.mark.parametrize("event", list(PAYLOADS))
    def test_handles_event(self, event):
        res = post({"Authorization": SECRET}, json.dumps(PAYLOADS[event]))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_acknowledges_unknown_events(self):
        res = post({"Authorization": SECRET}, json.dumps({"event": "something_new", "data": {}}))
        assert res.status_code == 200

    def test_accepts_any_content_type(self):
        res = post({"Authorization": SECRET}, json.dumps(PAYLOADS["downlink"]), content_type="text/plain")
        assert res.status_code == 200

    def test_tolerates_decoder_output_without_result(self):
        res = post({"Authorization": SECRET}, json.dumps({"event": "decoder_output", "data": {}}))
        assert res.status_code == 200


class TestBodyValidation:
    def test_rejects_invalid_json(self):
        assert post({"Authorization": SECRET}, "{not json").status_code == 400

    def test_rejects_json_array(self):
        assert post({"Authorization": SECRET}, "[]").status_code == 400

    def test_rejects_empty_body(self):
        assert post({"Authorization": SECRET}, "").status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
