import json
import os

# Set test environment variables before importing the app
os.environ["SWAN_WEBHOOK_SECRET"] = "test_swan_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_swan_request

client = TestClient(app)

SECRET = os.environ["SWAN_WEBHOOK_SECRET"]

EVENTS = [
    "Transaction.Booked", "Transaction.Pending", "Transaction.Rejected", "Account.Created",
    "AccountHolder.Updated", "Card.Created", "Onboarding.Updated",
]

_counter = 0


def sample_payload(event_type="Transaction.Booked"):
    global _counter
    _counter += 1
    return {
        "eventType": event_type,
        "eventId": f"evt_{_counter}",
        "eventDate": "2021-08-18T09:35:46.673Z",
        "projectId": "project-id",
        "resourceId": "resource-id",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/swan",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretVerification:
    def test_correct_secret(self):
        res = post({"x-swan-secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"X-Swan-Secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({"x-swan-secret": "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({"x-swan-secret": "short"}).status_code == 401

    def test_whole_value_is_compared(self):
        assert post({"x-swan-secret": SECRET[:-1]}).status_code == 401
        assert post({"x-swan-secret": SECRET + "x"}).status_code == 401
        assert post({"x-swan-secret": "Bearer " + SECRET}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_swan_request({"x-swan-secret": "sécret"}, secret=SECRET) is False
        assert verify_swan_request({"x-swan-secret": SECRET}, secret="sécret") is False
        assert verify_swan_request({"x-swan-secret": "sécret"}, secret="sécret") is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_swan_request({"x-swan-secret": SECRET}, secret="") is False
        assert verify_swan_request({"x-swan-secret": SECRET}, secret=SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"x-swan-secret": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"x-swan-secret": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"x-swan-secret": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_secret_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({"x-swan-secret": SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"x-swan-secret": SECRET}, body=json.dumps(sample_payload("Something.New")))
        assert res.status_code == 200

    def test_dedupes_on_event_id(self, capsys):
        body = json.dumps(sample_payload())
        first = post({"x-swan-secret": SECRET}, body=body)
        second = post({"x-swan-secret": SECRET}, body=body)
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Transaction booked") == 1


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
