import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 7f3c9a1e5b2d4c68a0e1f2d3c4b5a697"
os.environ["UKG_READY_AUTHORIZATION"] = AUTH

import base64

from fastapi.testclient import TestClient

from main import app, safe_equal, verify_ukg_ready_request

client = TestClient(app)

# ILLUSTRATIVE payload: UKG Ready shows the real shape only in the app, per subscription
# (the fields you tick). These field names are made up for the test.
ACCOUNT_CREATED = {"accountId": 1001, "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com"}
ACCOUNT_UPDATED = {"accountId": 1001, "email": "ada.lovelace@example.com", "phone": "555-0100"}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(ACCOUNT_CREATED)
    return client.post(
        "/webhooks/ukg-ready",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestUkgReadyWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_account_updated_payload(self):
        assert post(json.dumps(ACCOUNT_UPDATED), {"Authorization": AUTH}).status_code == 200

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_token(self):
        assert post(headers={"Authorization": "Bearer wrong-token"}).status_code == 401

    def test_rejects_token_without_bearer_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer ", "")}).status_code == 401

    def test_rejects_basic_credentials(self):
        basic = "Basic " + base64.b64encode(b"user:pass").decode()
        assert post(headers={"Authorization": basic}).status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(ACCOUNT_CREATED), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400


class TestHelpers:
    def test_never_accepts_when_unconfigured(self):
        assert verify_ukg_ready_request({"authorization": "Bearer x"}, {}) is False
        assert verify_ukg_ready_request({"authorization": ""}, {"UKG_READY_AUTHORIZATION": ""}) is False

    def test_safe_equal_handles_non_ascii(self):
        assert safe_equal("Bearer é", "Bearer é") is True
        assert safe_equal("Bearer é", "Bearer e") is False
