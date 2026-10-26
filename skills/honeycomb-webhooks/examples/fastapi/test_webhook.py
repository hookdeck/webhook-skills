import json
import os

# Set test environment variables before importing the app
os.environ["HONEYCOMB_WEBHOOK_SECRET"] = "test_honeycomb_shared_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, classify_alert, verify_honeycomb_request

client = TestClient(app)

SECRET = os.environ["HONEYCOMB_WEBHOOK_SECRET"]
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Illustrative payloads: Honeycomb doesn't document the default payload field by field.
TRIGGER = {
    "name": "Slow checkout requests",
    "status": "TRIGGERED",
    "trigger_url": "https://ui.honeycomb.io/example/triggers/abc123",
    "threshold": {"op": ">", "value": 2000},
}
BURN_ALERT = {"slo_name": "Checkout availability", "alert_type": "exhaustion_time", "budget_remaining": 0.12}
ANOMALY = {"anomaly_id": "an_123", "summary": "Error rate anomaly"}

_n = 0


def unique_id():
    global _n
    _n += 1
    return f"delivery-{_n}"


def send(method, token=SECRET, body=None, delivery_id=None, content_type="application/json"):
    headers = {}
    if token is not None:
        headers["X-Honeycomb-Webhook-Token"] = token
    if delivery_id:
        headers["X-Honeycomb-Webhook-Delivery-ID"] = delivery_id
    if body is not None:
        headers["Content-Type"] = content_type
    return client.request(method, "/webhooks/honeycomb", content=body, headers=headers)


class TestSecretVerification:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_correct_secret(self, method):
        res = send(method, body=json.dumps(TRIGGER))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_wrong_secret(self, method):
        assert send(method, token="wrong", body=json.dumps(TRIGGER)).status_code == 401

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_missing_header(self, method):
        assert send(method, token=None, body=json.dumps(TRIGGER)).status_code == 401

    def test_checks_credential_before_parsing_body(self):
        assert send("POST", token="wrong", body="{not json").status_code == 401

    def test_compares_whole_value(self):
        for token in (SECRET + "x", SECRET[:-1], "Bearer " + SECRET):
            assert send("POST", token=token, body=json.dumps(TRIGGER)).status_code == 401

    def test_accepts_any_content_type(self):
        assert send("POST", body=json.dumps(TRIGGER), content_type="text/plain").status_code == 200


class TestVerifyFunction:
    def test_header_lookup_is_case_insensitive(self):
        assert verify_honeycomb_request(Headers({"X-HONEYCOMB-WEBHOOK-TOKEN": SECRET})) is True

    def test_fails_closed_when_unconfigured(self):
        assert verify_honeycomb_request({"x-honeycomb-webhook-token": "anything"}, "") is False

    def test_non_ascii_values_do_not_raise(self):
        assert verify_honeycomb_request({"x-honeycomb-webhook-token": "sécret-日本"}, "sécret-日本") is True
        assert verify_honeycomb_request({"x-honeycomb-webhook-token": "sécret-日本"}, "secret") is False
        assert verify_honeycomb_request({"x-honeycomb-webhook-token": "short"}) is False


class TestBodyHandling:
    def test_empty_body(self):
        assert send("POST", body="").status_code == 200

    def test_get_without_body(self):
        assert send("GET").status_code == 200

    def test_invalid_json(self):
        assert send("POST", body="{not json").status_code == 400

    def test_non_object_json(self):
        assert send("POST", body=json.dumps([1, 2])).status_code == 400


class TestAlertClassification:
    def test_trigger(self):
        assert classify_alert(TRIGGER) == "trigger"

    def test_slo_burn_alert(self):
        assert classify_alert(BURN_ALERT) == "slo_burn_alert"

    def test_anomaly(self):
        assert classify_alert(ANOMALY) == "anomaly"

    def test_unknown_for_custom_templates(self):
        assert classify_alert({"foo": 1}) == "unknown"

    @pytest.mark.parametrize("payload", [TRIGGER, BURN_ALERT, ANOMALY, {"foo": 1}])
    def test_returns_200(self, payload):
        assert send("POST", body=json.dumps(payload)).status_code == 200


class TestIdempotency:
    def test_repeated_delivery_id_is_acknowledged_without_reprocessing(self, capsys):
        delivery_id = unique_id()
        first = send("POST", body=json.dumps(TRIGGER), delivery_id=delivery_id)
        second = send("POST", body=json.dumps(TRIGGER), delivery_id=delivery_id)
        assert first.json() == {"received": True}
        assert second.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Trigger alert") == 1

    def test_unauthenticated_request_is_not_a_duplicate(self):
        delivery_id = unique_id()
        send("POST", body=json.dumps(TRIGGER), delivery_id=delivery_id)
        assert send("POST", token="wrong", body=json.dumps(TRIGGER), delivery_id=delivery_id).status_code == 401


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
