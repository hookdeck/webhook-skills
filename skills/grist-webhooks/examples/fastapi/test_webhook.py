import json
import os

# Set test environment variables before importing the app
CREDENTIAL = "Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516"
os.environ["GRIST_AUTHORIZATION"] = CREDENTIAL

from fastapi.testclient import TestClient

from main import app, safe_equal, verify_grist_request

client = TestClient(app)

# Shape taken from Grist's documented sample payload (trimmed): a JSON array of rows
ROWS = [
    {"id": 29, "manualSort": 29, "Title": "Trophy", "Price": 60, "Purchase_status": "wishlisted"},
    {"id": 24, "manualSort": 24, "Title": "Dataman", "Price": 50, "Purchase_status": "own digitally"},
]


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(ROWS)
    return client.post(
        "/webhooks/grist",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestGristWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": CREDENTIAL})
        assert res.status_code == 200
        assert res.json() == {"received": True, "rows": 2}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        res = post(headers={"Authorization": "Bearer 00000000-0000-0000-0000-000000000000"})
        assert res.status_code == 401

    def test_rejects_token_without_prefix(self):
        res = post(headers={"Authorization": CREDENTIAL.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_does_not_strip_or_parse_scheme(self):
        res = post(headers={"Authorization": CREDENTIAL.replace("Bearer", "Basic")})
        assert res.status_code == 401

    def test_non_ascii_header_is_rejected_not_an_error(self):
        res = post(headers={"Authorization": "Bearer café".encode("latin-1")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(ROWS), {"Authorization": CREDENTIAL}, "text/plain")
        assert res.status_code == 200

    def test_accepts_empty_array(self):
        assert post("[]", {"Authorization": CREDENTIAL}).status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": CREDENTIAL}).status_code == 400

    def test_json_object_returns_400(self):
        assert post('{"id": 1}', {"Authorization": CREDENTIAL}).status_code == 400

    def test_array_of_non_objects_returns_400(self):
        assert post("[1,2]", {"Authorization": CREDENTIAL}).status_code == 400


class TestHelpers:
    def test_compares_whole_header_including_basic_prefix(self):
        basic = "Basic dXNlcjpwYXNz"
        assert verify_grist_request({"authorization": basic}, {"GRIST_AUTHORIZATION": basic}) is True

    def test_safe_equal_handles_non_ascii(self):
        assert safe_equal("café", "café") is True
        assert safe_equal("café", "cafe") is False

    def test_never_accepts_when_unconfigured(self):
        assert verify_grist_request({"authorization": "Bearer x"}, {}) is False
        assert verify_grist_request({"authorization": ""}, {"GRIST_AUTHORIZATION": ""}) is False
