import json
import os

# Set test environment variables before importing the app
TOKEN = "token 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516"
os.environ["COTERIE_AUTHENTICATION"] = TOKEN

from fastapi.testclient import TestClient

from main import app, classify, verify_coterie_request

client = TestClient(app)

# Shapes taken from Coterie's documented sample payloads (trimmed)
APPLICATION = {
    "applicationId": "83857350-4bfb-4669-862c-61f05a7a4be9",
    "Status": "ReadyToQuote",
    "BusinessName": "Test The link",
}
QUOTE = {
    "quoteId": "323d6e60-cb75-4098-af71-a643d8f47dba",
    "PolicyType": "BOP",
    "Premium": 2699,
    "applicationId": "83857350-4bfb-4669-862c-61f05a7a4be9",
}
POLICY = {
    "PolicyId": "b6a4f634-a78f-40a2-bede-8bd352435d19",
    "PolicyNumber": "CSANDSB-00080305-00",
    "Status": "Pending",
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(APPLICATION)
    return client.post(
        "/webhooks/coterie",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCoterieWebhook:
    def test_accepts_full_authentication_header(self):
        res = post(headers={"Authentication": TOKEN})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_token(self):
        res = post(headers={"Authentication": "token 00000000-0000-0000-0000-000000000000"})
        assert res.status_code == 401

    def test_rejects_guid_without_prefix(self):
        res = post(headers={"Authentication": TOKEN.replace("token ", "")})
        assert res.status_code == 401

    def test_does_not_accept_authorization_header(self):
        assert post(headers={"Authorization": TOKEN}).status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(POLICY), {"Authentication": TOKEN}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authentication": TOKEN}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authentication": TOKEN}).status_code == 400

    def test_accepts_quote_and_policy(self):
        assert post(json.dumps(QUOTE), {"Authentication": TOKEN}).status_code == 200
        assert post(json.dumps(POLICY), {"Authentication": TOKEN}).status_code == 200


class TestHelpers:
    def test_classify(self):
        assert classify(APPLICATION) == "application"
        assert classify(QUOTE) == "quote"
        assert classify(POLICY) == "policy"
        assert classify({"foo": 1}) is None

    def test_never_accepts_when_unconfigured(self):
        assert verify_coterie_request({"authentication": "token x"}, {}) is False
        assert verify_coterie_request({"authentication": ""}, {"COTERIE_AUTHENTICATION": ""}) is False
