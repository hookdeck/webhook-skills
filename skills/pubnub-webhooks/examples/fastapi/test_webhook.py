import json
import os

# Set test environment variables before importing the app
os.environ["PUBNUB_WEBHOOK_SECRET"] = "Bearer test_pubnub_secret_0123456789"
os.environ.pop("PUBNUB_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, event_type_from_schema, verify_pubnub_request

client = TestClient(app)

SECRET = os.environ["PUBNUB_WEBHOOK_SECRET"]

SAMPLE_ITEMS = {
    "messages.pubsub.publish": {"channel": "c", "senderId": "u", "message": "hi", "timetoken": "1"},
    "messages.action.created": {"channel": "c", "userId": "u", "type": "reaction", "value": "1"},
    "messages.action.deleted": {"channel": "c", "userId": "u", "type": "reaction", "value": "1"},
    "presence.channel.user.state.in.changed": {"channel": "c", "userId": "u"},
    "presence.user.channel.joined": {"channel": "c", "userId": "u", "occupancy": 2},
    "presence.user.channel.left": {"channel": "c", "userId": "u", "occupancy": 1},
    "presence.user.timedout.in.channel": {"channelId": "c", "userId": "u", "occupancy": 0},
    "presence.channel.state.active": {"channel": "c"},
    "presence.channel.state.inactive": {"channel": "c"},
    "presence.channel.occupancy.counted": {"channel": "c", "occupancy": 7},
    "user.created": {"userId": "u", "name": "User"},
    "user.updated": {"userId": "u", "name": "User"},
    "user.deleted": {"userId": "u"},
    "channel.created": {"channelId": "c", "name": "c"},
    "channel.updated": {"channelId": "c", "name": "c"},
    "channel.deleted": {"channelId": "c"},
    "membership.created": {"channelId": "c", "userId": "u"},
    "membership.updated": {"channelId": "c", "userId": "u"},
    "membership.deleted": {"channelId": "c", "userId": "u"},
    "push.device.removed": {"device": "token", "platform": "ios"},
    "push.message.sending.failed": {"channel": "c", "platform": "apns", "payload": "too big"},
}


def sample_payload(event_type="messages.pubsub.publish"):
    return {
        "dataSchema": f"pubnub.com/schemas/events/{event_type}?v=1.0.0",
        "data": [SAMPLE_ITEMS.get(event_type, {})],
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/pubnub",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_exact_header_value_prefix_included(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_compares_whole_value_bare_secret_rejected(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        assert verify_pubnub_request(Headers({"authorization": SECRET}), secret="") is False
        monkeypatch.delenv("PUBNUB_WEBHOOK_SECRET")
        assert verify_pubnub_request(Headers({"authorization": SECRET})) is False

    def test_reads_custom_header_name(self, monkeypatch):
        monkeypatch.setenv("PUBNUB_WEBHOOK_HEADER", "X-PubNub-Secret")
        assert post({"x-pubnub-secret": SECRET}).status_code == 200
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_values_do_not_raise(self):
        assert verify_pubnub_request(Headers({"authorization": "sécret-é"}), secret="secret") is False
        assert verify_pubnub_request(Headers({"authorization": "sécret-é"}), secret="sécret-é") is True


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post({"Authorization": SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_missing_data_schema_returns_400(self):
        assert post({"Authorization": SECRET}, body=json.dumps({"data": []})).status_code == 400

    def test_array_body_returns_400(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_returns_401(self):
        assert post(body="{not json").status_code == 401


class TestEventType:
    def test_strips_prefix_and_version(self):
        assert event_type_from_schema(
            "pubnub.com/schemas/events/messages.pubsub.publish?v=1.0.0"
        ) == "messages.pubsub.publish"
        assert event_type_from_schema(
            "pubnub.com/schemas/events/presence.user.channel.joined?v=1.0.0"
        ) == "presence.user.channel.joined"
        assert event_type_from_schema("other.com/x?v=1") is None
        assert event_type_from_schema(None) is None

    @pytest.mark.parametrize("event_type", list(SAMPLE_ITEMS))
    def test_handles_event(self, event_type, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_event(self, capsys):
        body = json.dumps({"dataSchema": "pubnub.com/schemas/events/something.new?v=1.0.0", "data": [{}]})
        res = post({"Authorization": SECRET}, body=body)
        assert res.status_code == 200
        assert "Unhandled event: something.new" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
