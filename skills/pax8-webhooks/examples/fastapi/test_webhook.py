import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer 7d9f3c1e-5b2a-4e8d-9a60-c1d2e3f40516"
os.environ["PAX8_AUTHORIZATION"] = SECRET

from fastapi.testclient import TestClient

from main import app, classify, verify_pax8_request

client = TestClient(app)

# Illustrative payloads: Pax8's docs elide samplePayload, so the body shape is assumed.
SUBSCRIPTION_CREATE = {
    "topic": "SUBSCRIPTION",
    "action": "CREATE",
    "id": "00000000-0000-0000-0000-000000000001",
}
INVOICE_CREATE = {
    "topic": "INVOICE",
    "action": "CREATE",
    "id": "00000000-0000-0000-0000-000000000002",
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(SUBSCRIPTION_CREATE)
    return client.post(
        "/webhooks/pax8",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestPax8Webhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_value(self):
        assert post(headers={"Authorization": "Bearer wrong-value"}).status_code == 401

    def test_rejects_value_without_prefix(self):
        res = post(headers={"Authorization": SECRET.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_non_ascii_header_returns_401_not_500(self):
        res = post(headers={"Authorization": "Bearer é".encode("latin-1")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(INVOICE_CREATE), {"Authorization": SECRET}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": SECRET}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": SECRET}).status_code == 400

    def test_accepts_payload_without_topic(self):
        assert post('{"foo": 1}', {"Authorization": SECRET}).status_code == 200


class TestHelpers:
    def test_classify(self):
        assert classify(SUBSCRIPTION_CREATE) == {"topic": "SUBSCRIPTION", "action": "CREATE"}
        assert classify({"topic": "invoice", "action": "update"}) == {"topic": "INVOICE", "action": "UPDATE"}
        assert classify({"topic": 5}) == {"topic": None, "action": None}

    def test_compares_whole_value_for_bare_secret(self):
        cfg = {"PAX8_AUTHORIZATION": "my_super_secret"}
        assert verify_pax8_request({"authorization": "my_super_secret"}, cfg) is True
        assert verify_pax8_request({"authorization": "Bearer my_super_secret"}, cfg) is False

    def test_never_accepts_when_unconfigured(self):
        assert verify_pax8_request({"authorization": "Bearer x"}, {}) is False
        assert verify_pax8_request({"authorization": ""}, {"PAX8_AUTHORIZATION": ""}) is False
