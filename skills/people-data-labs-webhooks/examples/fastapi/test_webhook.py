import json
import os

# Set test environment variables before importing the app
os.environ["PEOPLE_DATA_LABS_WEBHOOK_HEADER"] = "Authorization"
os.environ["PEOPLE_DATA_LABS_WEBHOOK_SECRET"] = "Bearer pk_test_0123456789"

from fastapi.testclient import TestClient

from main import app, verify_pdl_request

client = TestClient(app)

SECRET = os.environ["PEOPLE_DATA_LABS_WEBHOOK_SECRET"]
IDS = ["9adnit66-hdZ5lkBbq-AOQ_0000", "YraxDoP16jzyjfxtn-1XJQ_0000", "6Wu6sKeyNfaLF3CVBgoysg_0000"]


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(IDS)
    return client.post(
        "/webhooks/people-data-labs",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSharedHeaderVerification:
    def test_accepts_exact_header_value(self):
        res = post(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post(headers={"aUtHoRiZaTiOn": SECRET}).status_code == 200

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_value(self):
        assert post(headers={"Authorization": "Bearer pk_wrong_0123456789"}).status_code == 401

    def test_compares_whole_value_not_bare_token(self):
        assert post(headers={"Authorization": "pk_test_0123456789"}).status_code == 401

    def test_rejects_different_length_value(self):
        assert post(headers={"Authorization": "x"}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        assert verify_pdl_request({"authorization": "Bearer pk_tést"}) is False

    def test_rejects_when_secret_not_configured(self):
        assert verify_pdl_request({"authorization": "anything"}, secret="") is False

    def test_supports_custom_header_name(self):
        assert verify_pdl_request({"x-pdl-key": "abc123"}, name="x-pdl-key", secret="abc123") is True
        assert verify_pdl_request({"authorization": "abc123"}, name="x-pdl-key", secret="abc123") is False


class TestBodyHandling:
    def test_authenticates_before_parsing(self):
        assert post(body="not json").status_code == 401

    def test_accepts_any_content_type(self):
        res = post(headers={"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_empty_batch(self):
        assert post(body="[]", headers={"Authorization": SECRET}).status_code == 200

    def test_invalid_json_returns_400(self):
        assert post(body="not json", headers={"Authorization": SECRET}).status_code == 400

    def test_object_body_returns_400(self):
        res = post(body=json.dumps({"ids": IDS}), headers={"Authorization": SECRET})
        assert res.status_code == 400

    def test_array_of_non_strings_returns_400(self):
        assert post(body="[1, 2]", headers={"Authorization": SECRET}).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
