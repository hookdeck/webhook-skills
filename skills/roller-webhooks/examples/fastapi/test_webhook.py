import json
import os

# Set test environment variables before importing the app
os.environ["ROLLER_WEBHOOK_API_KEY"] = "test_roller_api_key_0123456789abcdef"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_roller_request

client = TestClient(app)

KEY = os.environ["ROLLER_WEBHOOK_API_KEY"]

EVENTS = ["Booking.Created", "Booking.Updated", "Booking.Cancelled", "Customer.Created", "Redemption.Created", "PaymentLink.Created"]


def event_body(event):
    # ROLLER sends `type` and `eventType` as separate fields.
    type_, event_type = event.split(".")
    return json.dumps({"type": type_, "eventType": event_type})


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else event_body("Booking.Created")
    return client.post(
        "/webhooks/roller",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestApiKeyVerification:
    def test_correct_key(self):
        res = post({"x-roller-apikey": KEY})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"X-ROLLER-APIKEY": KEY}).status_code == 200

    def test_wrong_key_same_length(self):
        assert post({"x-roller-apikey": "x" * len(KEY)}).status_code == 401

    def test_wrong_key_different_length(self):
        assert post({"x-roller-apikey": "short"}).status_code == 401

    def test_whole_value_is_compared(self):
        assert post({"x-roller-apikey": KEY + "extra"}).status_code == 401
        assert post({"x-roller-apikey": KEY[:-1]}).status_code == 401

    def test_missing_key(self):
        assert post().status_code == 401

    def test_non_ascii_key_does_not_raise(self):
        assert verify_roller_request({"x-roller-apikey": "caf\u00e9-key"}) is False

    def test_fails_closed_when_unconfigured(self):
        assert verify_roller_request({"x-roller-apikey": KEY}, "") is False
        os.environ.pop("ROLLER_WEBHOOK_API_KEY")
        try:
            assert verify_roller_request({"x-roller-apikey": KEY}) is False
        finally:
            os.environ["ROLLER_WEBHOOK_API_KEY"] = KEY


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({"x-roller-apikey": KEY}, content_type="text/plain").status_code == 200

    def test_invalid_json_after_auth(self):
        assert post({"x-roller-apikey": KEY}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"x-roller-apikey": KEY}, body="[1,2]").status_code == 400

    def test_invalid_json_without_key_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"x-roller-apikey": KEY}, body=event_body(event))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_event(self):
        res = post({"x-roller-apikey": KEY}, body=event_body("Something.New"))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
