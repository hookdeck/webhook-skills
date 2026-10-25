import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer test_timify_secret_0123456789"
os.environ["TIMIFY_WEBHOOK_SECRET"] = SECRET
os.environ.pop("TIMIFY_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_timify_request

client = TestClient(app)

# Webhook names and types from TIMIFY's scope table (Sync webhooks are not supported).
WEBHOOKS = [
    ("Customers", "Created"), ("Customers", "Updated"), ("Customers", "Deleted"),
    ("Event", "Created"), ("Event", "Updated"), ("Event", "Deleted"),
    ("Events", "Deleted"),
    ("Services", "Created"), ("Services", "Updated"), ("Services", "Deleted"),
    ("Resource", "Created"), ("Resource", "Updated"), ("Resource", "Deleted"),
    ("Company", "Created"), ("Company", "Updated"), ("Company", "Deleted"),
    ("Manager", "Created"), ("Manager", "Updated"), ("Manager", "Deleted"),
    ("Enterprise", "Updated"),
    ("Customer Fields", "Created"), ("Customer Fields", "Updated"), ("Customer Fields", "Deleted"),
    ("Shift", "Created"), ("Shift", "Updated"), ("Shift", "Deleted"),
    ("Notification", "Created"),
    ("Service Groups", "Created"), ("Service Groups", "Updated"), ("Service Groups", "Deleted"),
]


def sample_payload(webhook="Event", event_type="Created"):
    # ILLUSTRATIVE payload: TIMIFY's overview page does not document the field names.
    return {"webhook": webhook, "type": event_type, "data": {"id": "evt_123", "start": "2026-10-26T09:00:00Z"}}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/timify",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderAuthentication:
    def test_accepts_whole_header_value_including_bearer_prefix(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_does_not_strip_bearer_prefix(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_matches_header_name_case_insensitively(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_rejects_wrong_value_of_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        headers = Headers({"authorization": "pässword".encode("utf-8").decode("latin-1")})
        assert verify_timify_request(headers, SECRET) is False
        assert verify_timify_request(Headers({"authorization": "pässword"}), "pässword") is True

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        headers = Headers({"authorization": SECRET})
        assert verify_timify_request(headers, "") is False
        monkeypatch.delenv("TIMIFY_WEBHOOK_SECRET")
        assert verify_timify_request(headers) is False

    def test_reads_header_named_by_env(self, monkeypatch):
        monkeypatch.setenv("TIMIFY_WEBHOOK_HEADER", "X-Timify-Secret")
        assert post({"x-timify-secret": SECRET}).status_code == 200
        assert post({"Authorization": SECRET}).status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_400_for_invalid_json_after_authenticating(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_400_for_non_object_json(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_401_not_400_for_invalid_json_without_header(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("webhook,event_type", WEBHOOKS)
    def test_handles_webhook(self, webhook, event_type, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(webhook, event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unrecognised_payloads(self):
        res = post({"Authorization": SECRET}, body=json.dumps({"something": "else"}))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
