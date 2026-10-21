import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
# Channel tokens are arbitrary strings up to 256 chars; Google recommends a
# URL-query style encoding like this one.
os.environ["GOOGLE_WORKSPACE_CHANNEL_TOKEN"] = "target=myApp&secret=test_channel_token_123"

from main import app, verify_channel_token  # noqa: E402

client = TestClient(app)

TOKEN = os.environ["GOOGLE_WORKSPACE_CHANNEL_TOKEN"]
ENDPOINT = "/webhooks/google-workspace"


def goog_headers(**overrides):
    """Headers Google sends on every notification (see Drive push docs example)."""
    headers = {
        "Content-Type": "application/json; utf-8",
        "X-Goog-Channel-ID": "4ba78bf0-6a47-11e2-bcfd-0800200c9a66",
        "X-Goog-Channel-Token": TOKEN,
        "X-Goog-Channel-Expiration": "Tue, 19 Nov 2013 01:13:52 GMT",
        "X-Goog-Resource-ID": "ret08u3rv24htgh289g",
        "X-Goog-Resource-URI": "https://www.googleapis.com/drive/v3/files/ret08u3rv24htgh289g",
        "X-Goog-Resource-State": "update",
        "X-Goog-Message-Number": "11",
    }
    headers.update(overrides)
    return {k: v for k, v in headers.items() if v is not None}


class TestVerifyChannelToken:
    def test_matching_token_returns_true(self):
        assert verify_channel_token(TOKEN, TOKEN) is True

    def test_mismatched_token_returns_false(self):
        assert verify_channel_token("target=myApp&secret=wrong_channel_token", TOKEN) is False

    def test_missing_received_returns_false(self):
        assert verify_channel_token(None, TOKEN) is False

    def test_missing_expected_returns_false(self):
        assert verify_channel_token(TOKEN, None) is False

    def test_different_length_returns_false(self):
        assert verify_channel_token("short", TOKEN) is False


class TestWebhookEndpoint:
    def test_sync_message_returns_200(self):
        res = client.post(
            ENDPOINT,
            headers=goog_headers(**{"X-Goog-Resource-State": "sync", "X-Goog-Message-Number": "1"}),
        )
        assert res.status_code == 200

    def test_drive_update_with_changed_header(self):
        res = client.post(ENDPOINT, headers=goog_headers(**{"X-Goog-Changed": "content,properties"}))
        assert res.status_code == 200

    @pytest.mark.parametrize("state", ["add", "remove", "trash", "untrash", "change"])
    def test_drive_resource_states(self, state):
        res = client.post(ENDPOINT, headers=goog_headers(**{"X-Goog-Resource-State": state}))
        assert res.status_code == 200

    @pytest.mark.parametrize("state", ["exists", "not_exists"])
    def test_calendar_resource_states(self, state):
        res = client.post(
            ENDPOINT,
            headers=goog_headers(
                **{
                    "X-Goog-Resource-State": state,
                    "X-Goog-Resource-URI": "https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events",
                }
            ),
        )
        assert res.status_code == 200

    def test_admin_directory_notification_with_json_body(self):
        body = {
            "kind": "admin#directory#user",
            "id": "111220860655841818702",
            "etag": '"Mf8RAmnABsVfQ47MMT_18MHAdRE/evLIDlz2Fd9zbAqwvIp7Pzq8UAw"',
            "primaryEmail": "user@mydomain.com",
        }
        res = client.post(
            ENDPOINT,
            headers=goog_headers(
                **{
                    "X-Goog-Resource-State": "delete",
                    "X-Goog-Resource-URI": "https://admin.googleapis.com/admin/directory/v1/users?domain=mydomain.com&event=delete&alt=json",
                }
            ),
            content=json.dumps(body),
        )
        assert res.status_code == 200

    def test_unknown_resource_state_returns_200(self):
        res = client.post(ENDPOINT, headers=goog_headers(**{"X-Goog-Resource-State": "something_new"}))
        assert res.status_code == 200

    def test_wrong_token_returns_400(self):
        res = client.post(
            ENDPOINT,
            headers=goog_headers(**{"X-Goog-Channel-Token": "target=myApp&secret=wrong_channel_token"}),
        )
        assert res.status_code == 400

    def test_missing_token_returns_400(self):
        res = client.post(ENDPOINT, headers=goog_headers(**{"X-Goog-Channel-Token": None}))
        assert res.status_code == 400

    def test_missing_resource_state_returns_400(self):
        res = client.post(ENDPOINT, headers=goog_headers(**{"X-Goog-Resource-State": None}))
        assert res.status_code == 400

    def test_missing_channel_id_returns_400(self):
        res = client.post(ENDPOINT, headers=goog_headers(**{"X-Goog-Channel-ID": None}))
        assert res.status_code == 400

    def test_non_numeric_message_number_returns_400(self):
        res = client.post(ENDPOINT, headers=goog_headers(**{"X-Goog-Message-Number": "abc"}))
        assert res.status_code == 400

    def test_unconfigured_token_returns_500(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_WORKSPACE_CHANNEL_TOKEN")
        res = client.post(ENDPOINT, headers=goog_headers())
        assert res.status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
