import json
import os

# Set test environment variables before importing the app
os.environ["PAPERFORM_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["PAPERFORM_WEBHOOK_SECRET"] = "Bearer test_paperform_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_paperform_request

client = TestClient(app)

HEADER = os.environ["PAPERFORM_WEBHOOK_HEADER"]
SECRET = os.environ["PAPERFORM_WEBHOOK_SECRET"]


def sample_payload():
    return {
        "data": [
            {"title": "question 1", "description": "First", "type": "address", "key": "ba7ri", "custom_key": "address_1", "value": "343 Tester Road"},
            {"title": "question 2", "description": None, "type": "text", "key": "tgp8", "custom_key": None, "value": "Test 123"},
        ],
        "submission_id": "XXXXXXXXXXXXXXXXXXX",
        "created_at": "2017-06-09 09:51:23",
        "ip_address": "192.168.10.1",
        "charge": None,
    }


def post(headers=None, body=None, content_type="application/json", path="/webhooks/paperform"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        path,
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-webhook-secret": SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_different_length_without_raising(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_secret_under_other_header(self):
        assert post({"X-Other": SECRET}).status_code == 401


class TestVerifyFunction:
    def test_defaults_header_name_to_authorization(self, monkeypatch):
        monkeypatch.delenv("PAPERFORM_WEBHOOK_HEADER")
        assert verify_paperform_request(Headers({"authorization": "Bearer abc"}), secret="Bearer abc") is True

    def test_rejects_when_no_secret_configured(self):
        assert verify_paperform_request({"x-webhook-secret": "anything"}, secret="") is False

    def test_non_ascii_values_do_not_raise(self):
        headers = {"x-a": "sécret✓"}
        assert verify_paperform_request(headers, header_name="x-a", secret="sécret✓") is True
        assert verify_paperform_request(headers, header_name="x-a", secret="sécret✗") is False


class TestPayloadHandling:
    def test_accepts_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_partial_submission_trigger(self, capsys):
        res = post({HEADER: SECRET}, path="/webhooks/paperform?trigger=partial")
        assert res.status_code == 200
        assert capsys.readouterr().out.startswith("Partial submission")

    def test_default_trigger_is_new_submission(self, capsys):
        post({HEADER: SECRET})
        assert capsys.readouterr().out.startswith("New submission")

    def test_payment_submission_with_charge(self):
        body = json.dumps({**sample_payload(), "charge": {"total": "10.00", "currency": "USD"}})
        assert post({HEADER: SECRET}, body=body).status_code == 200

    def test_invalid_json_returns_400(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_data_not_a_list_returns_400(self):
        assert post({HEADER: SECRET}, body=json.dumps({"data": "x"})).status_code == 400

    def test_authenticates_before_parsing(self):
        assert post(body="{not json").status_code == 401


def test_health():
    assert client.get("/health").status_code == 200
