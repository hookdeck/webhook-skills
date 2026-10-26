import json
import os

# Set test environment variables before importing the app
os.environ["PAYROC_WEBHOOK_SECRET"] = "test_payroc_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, seen_ids, verify_payroc_request

client = TestClient(app)

SECRET = os.environ["PAYROC_WEBHOOK_SECRET"]

# Payloads follow the samples in Payroc's event documentation.
SAMPLES = {
    "processingAccount.status.changed": {
        "specversion": "1.0",
        "type": "processingAccount.status.changed",
        "version": "1.0.0",
        "source": "payroc",
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "time": "2024-07-02T15:30:00.000Z",
        "datacontenttype": "application/json",
        "data": {"processingAccountId": "38765", "status": "entered"},
    },
    "processingAccount.riskStatus.changed": {
        "specversion": "1.0",
        "type": "processingAccount.riskStatus.changed",
        "version": "1.0.0",
        "source": "payroc",
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "time": "2024-09-15T10:45:00.000Z",
        "datacontenttype": "application/json",
        "data": {"processingAccountId": "38765", "riskStatus": "fullSuspense"},
    },
    "processingAccount.signature.signed": {
        "specversion": "1.0",
        "type": "processingAccount.signature.signed",
        "version": "1.0.0",
        "source": "payroc",
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "time": "2026-05-21T11:30:00.000Z",
        "datacontenttype": "application/json",
        "data": {"processingAccountId": "38765", "signed": "true"},
    },
    # No documented sample payload: same CloudEvents envelope, illustrative data.
    "terminalOrder.status.changed": {
        "specversion": "1.0",
        "type": "terminalOrder.status.changed",
        "version": "1.0.0",
        "source": "payroc",
        "id": "123e4567-e89b-12d3-a456-426614174002",
        "time": "2024-07-02T15:30:00.000Z",
        "datacontenttype": "application/json",
        "data": {"terminalOrderId": "1234"},
    },
}

DEFAULT = SAMPLES["processingAccount.status.changed"]


@pytest.fixture(autouse=True)
def reset_seen_ids():
    seen_ids.clear()


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(DEFAULT)
    return client.post(
        "/webhooks/payroc",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretVerification:
    def test_correct_secret(self):
        res = post({"Payroc-Secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"payroc-secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({"Payroc-Secret": "x" * len(SECRET)}).status_code == 401

    def test_different_length(self):
        assert post({"Payroc-Secret": "short"}).status_code == 401

    def test_prefix_of_secret(self):
        assert post({"Payroc-Secret": SECRET[:-1]}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_authorization_bearer_not_accepted(self):
        assert post({"Authorization": f"Bearer {SECRET}"}).status_code == 401

    def test_fails_closed_when_unconfigured(self):
        assert verify_payroc_request({"payroc-secret": SECRET}, "") is False

    def test_reads_env_by_default(self):
        assert verify_payroc_request({"payroc-secret": SECRET}) is True

    def test_non_ascii_secret_does_not_raise(self):
        # compare_digest on str would raise TypeError; bytes comparison must not.
        assert verify_payroc_request({"payroc-secret": "café"}, "café") is True
        assert verify_payroc_request({"payroc-secret": "café"}, "cafe") is False


class TestEvents:
    @pytest.mark.parametrize("event_type", list(SAMPLES))
    def test_handles_event(self, event_type):
        res = post({"Payroc-Secret": SECRET}, json.dumps(SAMPLES[event_type]))
        assert res.status_code == 200

    def test_unknown_event_acknowledged(self):
        body = json.dumps({**DEFAULT, "type": "something.else"})
        assert post({"Payroc-Secret": SECRET}, body).status_code == 200

    def test_duplicate_id_not_reprocessed(self, capsys):
        post({"Payroc-Secret": SECRET})
        capsys.readouterr()
        res = post({"Payroc-Secret": SECRET})
        assert res.status_code == 200
        assert res.json()["duplicate"] is True
        assert capsys.readouterr().out == ""


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Payroc-Secret": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"Payroc-Secret": SECRET}, "not json").status_code == 400

    def test_json_array(self):
        assert post({"Payroc-Secret": SECRET}, "[]").status_code == 400

    def test_invalid_body_without_secret_is_401(self):
        assert post(body="not json").status_code == 401
