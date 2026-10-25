import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer your-subscriber-secret-123"
os.environ["REDO_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, classify, verify_redo_request

client = TestClient(app)

# Shapes taken from Redo's documented sample payload (trimmed)
CREATED = {
    "type": "created",
    "at": "2023-08-18T12:00:00Z",
    "merchantName": "Example Merchant",
    "return": {"id": "64df65d4c5a4ca3eff4b4e43", "status": "pending"},
    "order": {"id": "shopify-order-123"},
}
UPDATED = {**CREATED, "type": "updated", "return": {**CREATED["return"], "status": "approved"}}
BACKFILL = {**CREATED, "type": "backfill"}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(CREATED)
    return client.post(
        "/webhooks/redo",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestRedoWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(headers={"Authorization": "Bearer some-other-secret"}).status_code == 401

    def test_rejects_secret_without_bearer_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer ", "")}).status_code == 401

    def test_rejects_different_scheme(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer", "Basic")}).status_code == 401

    def test_non_ascii_header_returns_401_not_500(self):
        res = post(headers={"Authorization": "Bearer sécret".encode("latin-1")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(UPDATED), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400

    def test_body_not_parsed_before_credential_check(self):
        assert post("not json").status_code == 401

    def test_accepts_updated_backfill_and_unknown_types(self):
        for body in (UPDATED, BACKFILL, {"type": "other"}):
            assert post(json.dumps(body), {"Authorization": AUTH}).status_code == 200


class TestHelpers:
    def test_classify(self):
        assert classify(CREATED) == "return.created"
        assert classify(UPDATED) == "return.updated"
        assert classify(BACKFILL) == "backfill"
        assert classify({"type": "x"}) is None

    def test_never_accepts_when_unconfigured(self):
        assert verify_redo_request({"authorization": "Bearer x"}, {}) is False
        assert verify_redo_request({"authorization": ""}, {"REDO_AUTHORIZATION": ""}) is False
