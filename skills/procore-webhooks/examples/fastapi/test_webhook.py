import json
import os

# Format from the Procore docs: a token, not base64 user:pass. Never decoded.
AUTH = "Basic c3a24b8208ac5199d083d54a1234e94b8864"
os.environ["PROCORE_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, verify_procore_request

client = TestClient(app)


def payload(event_type):
    # Illustrative v2 payload; field names are not confirmed against the developer docs
    return {
        "id": "evt_1",
        "ulid": "01H8XYZ0000000000000000000",
        "timestamp": "2026-10-25T12:00:00Z",
        "user_id": 42,
        "company_id": 1001,
        "project_id": 2002,
        "api_version": "v2",
        "event_type": event_type,
        "resource_name": "RFIs",
        "resource_id": 3003,
    }


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(payload("create"))
    return client.post(
        "/webhooks/procore",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestProcoreWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Basic 0000"}).status_code == 401

    def test_rejects_token_without_scheme_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Basic ", "")}).status_code == 401

    def test_rejects_different_scheme(self):
        assert post(headers={"Authorization": AUTH.replace("Basic", "Bearer")}).status_code == 401

    def test_non_ascii_header_returns_401_not_500(self):
        res = client.post(
            "/webhooks/procore",
            content=json.dumps(payload("create")),
            headers={"Content-Type": "application/json", "Authorization": "Basic café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(payload("update")), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_handles_create_update_delete(self):
        for event_type in ("create", "update", "delete"):
            assert post(json.dumps(payload(event_type)), {"Authorization": AUTH}).status_code == 200

    def test_unknown_event_type_returns_200(self):
        assert post(json.dumps(payload("other")), {"Authorization": AUTH}).status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400


class TestHelpers:
    def test_never_accepts_when_unconfigured(self):
        assert verify_procore_request({"authorization": "x"}, {}) is False
        assert verify_procore_request({"authorization": ""}, {"PROCORE_AUTHORIZATION": ""}) is False
