import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer sfasdfw34243"
os.environ["BITDEFENDER_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, verify_bitdefender_request

client = TestClient(app)

# Shapes from the Bitdefender "Push event JSON RPC messages" docs (trimmed)
AV = {
    "module": "av",
    "computer_name": "IRU-WIN10X64-A",
    "malware_name": "EICAR-Test-File (not a virus)",
    "final_status": "quarantined",
}
APH = {
    "module": "aph",
    "computer_name": "FC-EXCHANGE-01",
    "url": "http://example.com/account/support/",
    "status": "aph_blocked",
}


def rpc(events):
    return {"jsonrpc": "2.0", "method": "addEvents", "params": {"events": events}, "id": 1694701009244}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(rpc([AV, APH]))
    return client.post(
        "/webhooks/bitdefender",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBitdefenderWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_rejects_credential_without_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer ", "")}).status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/bitdefender",
            content=json.dumps(rpc([AV])),
            headers={"Authorization": "Bearer café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(rpc([AV])), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_missing_events_returns_400(self):
        body = json.dumps({"jsonrpc": "2.0", "method": "addEvents", "params": {}, "id": 1})
        assert post(body, {"Authorization": AUTH}).status_code == 400

    def test_other_method_returns_400(self):
        body = json.dumps({"jsonrpc": "2.0", "method": "other", "params": {"events": []}, "id": 1})
        assert post(body, {"Authorization": AUTH}).status_code == 400

    def test_accepts_unknown_module(self):
        body = json.dumps(rpc([{"module": "something-new"}]))
        assert post(body, {"Authorization": AUTH}).status_code == 200


class TestHelpers:
    def test_never_accepts_when_unconfigured(self):
        assert verify_bitdefender_request({"authorization": "Bearer x"}, {}) is False
        assert verify_bitdefender_request({"authorization": ""}, {"BITDEFENDER_AUTHORIZATION": ""}) is False
