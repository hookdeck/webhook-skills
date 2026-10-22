import json
import os

# Set test environment variables before importing the app
os.environ["PAXOS_WEBHOOK_HEADER"] = "X-Paxos-Webhook-Secret"
os.environ["PAXOS_WEBHOOK_SECRET"] = "Bearer test_paxos_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_paxos_request

client = TestClient(app)

HEADER = os.environ["PAXOS_WEBHOOK_HEADER"]
SECRET = os.environ["PAXOS_WEBHOOK_SECRET"]

EVENTS = [
    "identity.approved", "identity.denied", "identity.documents_required",
    "identity.documents_accepted", "identity.documents_denied",
    "transfer.crypto_deposit.pending", "transfer.crypto_deposit.completed",
    "transfer.wire_withdrawal.failed", "orchestration.processing", "orchestration.completed",
    "orchestration.failed",
]


def sample_event(event_type="identity.approved", **extra):
    return {
        "id": "bd019f1c-89a7-4372-9d21-eaad9280dc41",
        "type": event_type,
        "source": "com.paxos",
        "time": "2025-01-01T14:30:02Z",
        "object": "event",
        "is_test": False,
        **extra,
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_event())
    return client.post(
        "/webhooks/paxos",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestApiKeyHeaderVerification:
    def test_accepts_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_case_insensitive(self):
        assert post({HEADER.upper(): SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_does_not_read_secret_from_other_header(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_does_not_raise(self):
        assert verify_paxos_request({HEADER: "sécret-ключ"}, SECRET, HEADER) is False
        assert verify_paxos_request({HEADER: SECRET}, "sécret-ключ", HEADER) is False

    def test_unset_secret_rejects_everything(self):
        headers = {HEADER: SECRET}
        assert verify_paxos_request(headers, "", HEADER) is False
        saved = os.environ.pop("PAXOS_WEBHOOK_SECRET")
        try:
            assert verify_paxos_request(headers) is False
        finally:
            os.environ["PAXOS_WEBHOOK_SECRET"] = saved

    def test_default_header_is_authorization(self):
        saved = os.environ.pop("PAXOS_WEBHOOK_HEADER")
        try:
            assert verify_paxos_request(Headers({"authorization": "abc"}), "abc") is True
        finally:
            os.environ["PAXOS_WEBHOOK_HEADER"] = saved


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_after_auth_is_400(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_missing_type_is_400(self):
        assert post({HEADER: SECRET}, body='{"id":"1"}').status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_event(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_ignores_test_events(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_event(is_test=True)))
        assert res.status_code == 200
        assert res.json()["test"] is True
        assert "Identity approved" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_event("something.new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
