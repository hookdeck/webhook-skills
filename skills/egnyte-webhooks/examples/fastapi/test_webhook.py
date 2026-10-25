import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer secret-token-12345"
os.environ["EGNYTE_AUTHORIZATION"] = SECRET

from fastapi.testclient import TestClient

from main import app, verify_egnyte_request

client = TestClient(app)

# Shape taken from Egnyte's documented webhook payload (trimmed)
BATCH = {
    "data": [
        {
            "eventId": "evt-1",
            "domain": "apidemo",
            "timestamp": 1710000000000,
            "user": {"id": 1, "displayName": "John Doe", "username": "johndoe", "email": "john@example.com"},
            "actionSource": "WebUI",
            "eventType": "fs:add_file",
            "webhookId": "c9ac0519-284a-4bee-9574-30ae7891e5dc",
            "data": {"targetPath": "/Shared/Documents/a.txt", "itemType": "file"},
        },
        {
            "eventId": "evt-2",
            "domain": "apidemo",
            "timestamp": 1710000001000,
            "user": {"id": 1, "username": "johndoe"},
            "actionSource": "API",
            "eventType": "link:create",
            "webhookId": "c9ac0519-284a-4bee-9574-30ae7891e5dc",
            "data": {},
        },
    ]
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(BATCH)
    return client.post(
        "/webhooks/egnyte",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestEgnyteWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Bearer wrong-token-00000"}).status_code == 401

    def test_rejects_credential_without_prefix(self):
        res = post(headers={"Authorization": SECRET.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_non_ascii_credential_without_error(self):
        res = post(headers={"Authorization": "Bearer sécret".encode("latin-1")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(BATCH), {"Authorization": SECRET}, "text/plain")
        assert res.status_code == 200

    def test_dispatches_every_event(self, capsys):
        post(headers={"Authorization": SECRET})
        out = capsys.readouterr().out
        assert "File added: /Shared/Documents/a.txt" in out
        assert "Link created by johndoe" in out

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps({"data": [{"eventId": "e", "eventType": "user:create"}]})
        assert post(body, {"Authorization": SECRET}).status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": SECRET}).status_code == 400

    def test_data_not_a_list_returns_400(self):
        assert post('{"data": {}}', {"Authorization": SECRET}).status_code == 400
        assert post("[1,2]", {"Authorization": SECRET}).status_code == 400


class TestHelpers:
    def test_never_accepts_when_unconfigured(self):
        assert verify_egnyte_request({"authorization": "Bearer x"}, {}) is False
        assert verify_egnyte_request({"authorization": ""}, {"EGNYTE_AUTHORIZATION": ""}) is False
