import json
import os

# Set test environment variables before importing the app
os.environ["VTEX_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["VTEX_WEBHOOK_SECRET"] = "test_vtex_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_vtex_request

client = TestClient(app)

HEADER = os.environ["VTEX_WEBHOOK_HEADER"]
SECRET = os.environ["VTEX_WEBHOOK_SECRET"]

STATES = [
    "order-created", "on-order-completed", "payment-pending", "payment-approved",
    "waiting-ffmt-authorization", "ready-for-handling", "start-handling", "handling",
    "invoiced", "cancel", "canceled",
]


def sample_payload(state="payment-approved"):
    return {
        "Domain": "Marketplace",
        "OrderId": "v40484048naf-01",
        "State": state,
        "LastChange": "2019-07-29T23:17:30.0617185Z",
        "Origin": {"Account": "accountABC", "Key": "vtexappkey-keyEDF"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/vtex",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_secret(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-webhook-secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_whole_value_is_compared_no_bearer_parsing(self):
        assert post({HEADER: f"Bearer {SECRET}"}).status_code == 401

    def test_configured_value_may_include_bearer(self):
        assert verify_vtex_request({"authorization": "Bearer abc123"}, "Authorization", "Bearer abc123") is True
        assert verify_vtex_request({"authorization": "abc123"}, "Authorization", "Bearer abc123") is False

    def test_header_name_comes_from_configuration(self):
        assert verify_vtex_request({"x-custom": SECRET}, "X-Custom", SECRET) is True
        assert verify_vtex_request({"x-custom": SECRET}, "X-Webhook-Secret", SECRET) is False

    def test_non_ascii_values_do_not_raise(self):
        assert verify_vtex_request({"x-webhook-secret": "señor"}, HEADER, "secret") is False
        assert verify_vtex_request({"x-webhook-secret": "señor"}, HEADER, "señor") is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_vtex_request({"x-webhook-secret": SECRET}, HEADER, "") is False
        assert verify_vtex_request({"x-webhook-secret": SECRET}, HEADER, SECRET) is True


class TestSetupPing:
    def test_ping_without_headers(self):
        assert post(body=json.dumps({"hookConfig": "ping"})).status_code == 200

    def test_ping_with_wrong_secret(self):
        assert post({HEADER: "nope"}, body=json.dumps({"hookConfig": "ping"})).status_code == 200

    def test_ping_is_not_dispatched(self, capsys):
        post(body=json.dumps({"hookConfig": "ping"}))
        assert capsys.readouterr().out == ""


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_secret_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("state", STATES)
    def test_handles_state(self, state, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(state)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_state_is_acknowledged(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("something-new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
