import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer test_hightouch_secret_0123456789"
os.environ["HIGHTOUCH_WEBHOOK_SECRET"] = SECRET
os.environ.pop("HIGHTOUCH_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient

from main import app, verify_hightouch_request

client = TestClient(app)

ROW = {"id": "cus_123", "email": "alice@example.com", "first_name": "Alice"}
AUTH = {"Authorization": SECRET}


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = json.dumps(ROW) if body is None else body
    hdrs = dict(headers or {})
    if content != "":
        hdrs["Content-Type"] = content_type
    return client.request(method, "/webhooks/hightouch", content=content, headers=hdrs)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("HIGHTOUCH_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("HIGHTOUCH_WEBHOOK_HEADER", raising=False)


class TestCredentialVerification:
    def test_accepts_exact_header_value(self):
        res = send(headers=AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True, "trigger": "row_added"}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={"authorization": SECRET}).status_code == 200

    def test_compares_whole_value_not_the_part_after_bearer(self):
        assert send(headers={"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_does_not_normalise_bearer_prefix(self):
        assert send(headers={"Authorization": SECRET.replace("Bearer", "bearer")}).status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert send(headers={"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert send(headers={"Authorization": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_authenticates_before_parsing_body(self):
        assert send(body="{not json").status_code == 401

    def test_rejects_everything_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("HIGHTOUCH_WEBHOOK_SECRET")
        assert send(headers={"Authorization": "anything"}).status_code == 401

    def test_non_ascii_header_value_does_not_raise(self):
        # httpx only accepts non-ASCII header values as bytes; Starlette decodes them as latin-1.
        res = send(headers={"Authorization": "café".encode("utf-8")})
        assert res.status_code == 401

    def test_reads_custom_header_name_from_env(self, monkeypatch):
        monkeypatch.setenv("HIGHTOUCH_WEBHOOK_HEADER", "X-Hightouch-Key")
        assert send(headers={"x-hightouch-key": SECRET}).status_code == 200
        # The default header no longer counts.
        assert send(headers=AUTH).status_code == 401


class TestMethods:
    @pytest.mark.parametrize(
        "method,trigger",
        [("POST", "row_added"), ("PUT", "row_changed"), ("PATCH", "row_changed"), ("DELETE", "row_removed")],
    )
    def test_accepts_method(self, method, trigger):
        res = send(method, headers=AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True, "trigger": trigger}

    def test_accepts_get_with_no_body(self):
        res = send("GET", headers=AUTH, body="")
        assert res.status_code == 200
        assert res.json()["trigger"] == "unmapped"

    def test_get_still_requires_credential(self):
        assert send("GET", body="").status_code == 401


class TestBodies:
    def test_accepts_empty_body_on_post(self):
        assert send(headers=AUTH, body="").status_code == 200

    def test_accepts_batched_array(self):
        assert send(headers=AUTH, body=json.dumps([ROW, {**ROW, "id": "cus_456"}])).status_code == 200

    def test_accepts_batch_wrapped_in_object(self):
        assert send(headers=AUTH, body=json.dumps({"users": [ROW]})).status_code == 200

    def test_accepts_any_content_type(self):
        assert send(headers=AUTH, content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert send(headers=AUTH, body="{not json").status_code == 400


class TestVerifyFunction:
    def test_explicit_secret_and_header_name(self):
        assert verify_hightouch_request({"x-key": "abc"}, "abc", "X-Key") is True
        assert verify_hightouch_request({"x-key": "abd"}, "abc", "X-Key") is False
        assert verify_hightouch_request({}, "abc", "X-Key") is False
        assert verify_hightouch_request({"x-key": "abc"}, "", "X-Key") is False

    def test_non_ascii_does_not_raise(self):
        assert verify_hightouch_request({"x-key": "café"}, "cafe", "X-Key") is False
