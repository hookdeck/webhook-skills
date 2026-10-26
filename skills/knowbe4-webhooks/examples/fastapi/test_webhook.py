import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer 7f3c9a1e5b2d4086a9c1e3f5071b2d4c"
os.environ["KNOWBE4_WEBHOOK_SECRET"] = SECRET
os.environ.pop("KNOWBE4_WEBHOOK_HEADER", None)  # default: Authorization

from fastapi.testclient import TestClient

from main import app, verify_knowbe4_request

client = TestClient(app)

# ILLUSTRATIVE payload: KnowBe4 documents no body schema or event field.
PAYLOAD = {"event_type": "Phish Failure Removed", "System": "KnowBe4"}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PAYLOAD)
    return client.post(
        "/webhooks/knowbe4",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestKnowbe4Webhook:
    def test_accepts_whole_authorization_value(self):
        res = post(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_lookup_is_case_insensitive(self):
        assert post(headers={"authorization": SECRET}).status_code == 200

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(headers={"Authorization": "Bearer wrong"}).status_code == 401

    def test_does_not_strip_bearer_prefix(self):
        assert post(headers={"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_longer_value_starting_with_secret(self):
        assert post(headers={"Authorization": SECRET + "x"}).status_code == 401

    def test_authenticates_before_parsing(self):
        assert post(body="not json").status_code == 401

    def test_invalid_json_after_auth_is_400(self):
        assert post(body="not json", headers={"Authorization": SECRET}).status_code == 400

    def test_json_array_is_400(self):
        assert post(body="[1, 2]", headers={"Authorization": SECRET}).status_code == 400

    def test_accepts_any_content_type(self):
        res = post(headers={"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_payload_without_event_type(self):
        res = post(body=json.dumps({"System": "PhishER"}), headers={"Authorization": SECRET})
        assert res.status_code == 200

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}


class TestVerifyKnowbe4Request:
    def test_header_name_from_config(self):
        config = {"KNOWBE4_WEBHOOK_HEADER": "X-KnowBe4-Key", "KNOWBE4_WEBHOOK_SECRET": "abc123"}
        assert verify_knowbe4_request({"x-knowbe4-key": "abc123"}, config) is True
        assert verify_knowbe4_request({"authorization": "abc123"}, config) is False

    def test_fails_closed_when_unset(self):
        assert verify_knowbe4_request({"authorization": "None"}, {}) is False

    def test_non_ascii_does_not_raise(self):
        config = {"KNOWBE4_WEBHOOK_SECRET": "sécrèt✓"}
        assert verify_knowbe4_request({"authorization": "sécrèt✓"}, config) is True
        assert verify_knowbe4_request({"authorization": "secret"}, config) is False
