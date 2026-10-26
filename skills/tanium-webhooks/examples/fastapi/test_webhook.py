import json
import os

# Set test environment variables before importing the app
os.environ["TANIUM_WEBHOOK_HEADER"] = "X-Tanium-Secret"
os.environ["TANIUM_WEBHOOK_SECRET"] = "Bearer test_tanium_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_tanium_request

client = TestClient(app)

HEADER = os.environ["TANIUM_WEBHOOK_HEADER"]
SECRET = os.environ["TANIUM_WEBHOOK_SECRET"]

# Illustrative payload: Tanium has no event field. The real body is whatever the
# Connect connection is configured to send (source rows with the chosen columns).
RECORDS = [
    {"Computer Name": "host-1.example.com", "IP Address": "10.0.0.5", "Operating System": "Windows Server 2022"},
    {"Computer Name": "host-2.example.com", "IP Address": "10.0.0.6", "Operating System": "Ubuntu 24.04"},
]


def send(headers=None, body=None, method="POST", content_type="application/json"):
    content = body if body is not None else json.dumps(RECORDS)
    h = {"Content-Type": content_type} if content_type else {}
    return client.request(method, "/webhooks/tanium", content=content, headers={**h, **(headers or {})})


class TestHeaderAuthentication:
    def test_correct_value(self):
        res = send({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_is_compared_prefix_included(self):
        assert send({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert send({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert send({HEADER: "short"}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_tanium_request({HEADER: "é" * len(SECRET)}, secret=SECRET, header_name=HEADER) is False
        assert verify_tanium_request({HEADER: SECRET}, secret="é-secret", header_name=HEADER) is False

    def test_missing_header(self):
        assert send().status_code == 401

    def test_secret_under_a_different_header(self):
        assert send({"Authorization": SECRET}).status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_tanium_request({HEADER: SECRET}, secret="", header_name=HEADER) is False
        assert verify_tanium_request({HEADER: SECRET}, secret=SECRET, header_name=HEADER) is True

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("TANIUM_WEBHOOK_HEADER")
        assert verify_tanium_request({"Authorization": SECRET}, secret=SECRET) is True
        assert verify_tanium_request({HEADER: SECRET}, secret=SECRET) is False


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_method(self, method):
        assert send({HEADER: SECRET}, method=method).status_code == 200

    def test_put_is_authenticated(self):
        assert send(method="PUT").status_code == 401

    def test_delete_is_not_accepted(self):
        assert send({HEADER: SECRET}, method="DELETE").status_code == 405


class TestBodyHandling:
    def test_array_of_records(self, capsys):
        assert send({HEADER: SECRET}).status_code == 200
        assert "Received 2 record(s)" in capsys.readouterr().out

    def test_single_object(self, capsys):
        assert send({HEADER: SECRET}, body=json.dumps(RECORDS[0])).status_code == 200
        assert "Received 1 record(s)" in capsys.readouterr().out

    def test_any_content_type(self):
        assert send({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_empty_body(self):
        assert send({HEADER: SECRET}, body="", content_type=None).status_code == 200

    def test_invalid_json(self):
        assert send({HEADER: SECRET}, body="{not json").status_code == 400

    def test_scalar_json(self):
        assert send({HEADER: SECRET}, body="42").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert send(body="{not json").status_code == 401


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
