import json
import os

# Set test environment variables before importing the app
os.environ["JAMF_PRO_WEBHOOK_HEADER"] = "X-Jamf-Secret"
os.environ["JAMF_PRO_WEBHOOK_SECRET"] = "Bearer test_jamf_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import EVENT_LABELS, app, verify_jamf_pro_request

client = TestClient(app)

HEADER = os.environ["JAMF_PRO_WEBHOOK_HEADER"]
SECRET = os.environ["JAMF_PRO_WEBHOOK_SECRET"]
EVENTS = list(EVENT_LABELS)


def sample_payload(webhook_event="ComputerAdded"):
    return {
        "webhook": {"id": 1, "name": "Test webhook", "webhookEvent": webhook_event, "eventTimestamp": 1761400000000},
        "event": {"udid": "A1B2C3D4-0000-1111-2222-333344445555", "deviceName": "Mac-1", "serialNumber": "C02XXXXXXXXX", "jssID": 42},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/jamf-pro",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderAuthentication:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_other_header_name(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest on str raises TypeError for non-ASCII; the dependency encodes to bytes.
        assert verify_jamf_pro_request(Headers({HEADER: "pässword"})) is False

    def test_default_header_is_authorization(self):
        saved = os.environ.pop("JAMF_PRO_WEBHOOK_HEADER")
        try:
            assert verify_jamf_pro_request(Headers({"authorization": SECRET})) is True
            assert verify_jamf_pro_request(Headers({HEADER.lower(): SECRET})) is False
        finally:
            os.environ["JAMF_PRO_WEBHOOK_HEADER"] = saved

    def test_unset_secret_rejects_everything(self):
        assert verify_jamf_pro_request(Headers({HEADER.lower(): SECRET}), secret="") is False
        saved = os.environ.pop("JAMF_PRO_WEBHOOK_SECRET")
        try:
            assert verify_jamf_pro_request(Headers({HEADER.lower(): SECRET})) is False
        finally:
            os.environ["JAMF_PRO_WEBHOOK_SECRET"] = saved


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_xml_body_is_400_after_auth(self):
        res = post({HEADER: SECRET}, body="<JSSEvent></JSSEvent>", content_type="application/xml")
        assert res.status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEvents:
    def test_documented_event_count(self):
        assert len(EVENTS) == 22

    @pytest.mark.parametrize("webhook_event", EVENTS)
    def test_handles_event(self, webhook_event, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(webhook_event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_event(self):
        assert post({HEADER: SECRET}, body=json.dumps(sample_payload("SomethingNew"))).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
