import base64
import json
import os

import pytest
from fastapi.testclient import TestClient

USERNAME = "parcellab"
PASSWORD = "p@ss:word:with:colons"
os.environ["PARCELLAB_WEBHOOK_USERNAME"] = USERNAME
os.environ["PARCELLAB_WEBHOOK_PASSWORD"] = PASSWORD

from main import app, get_event_name, verify_parcellab_request  # noqa: E402

client = TestClient(app)


def basic(user=USERNAME, password=PASSWORD):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()


# Shape from parcelLab's documented example payload (trimmed)
DELIVERED = {
    "event": "onDelivered",
    "eventid": "abc123-def456",
    "timestamp": "2000-12-16T16:12:00.000Z",
    "references": {"courier": "dhl-germany", "tracking_number": "00340000000001", "orderNo": "ORD0012345"},
    "data": {"delivery_status": "Delivered", "delivery_location": "Doorstep"},
    "reporting": {"lead_time_door_to_door": 2, "lead_time_qualified_attempt": 2, "lead_time_end_to_end": 3},
}


def post(body, headers=None, content_type="application/json"):
    raw = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/parcellab",
        content=raw.encode("utf-8"),
        headers={"content-type": content_type, **(headers or {})},
    )


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("PARCELLAB_WEBHOOK_USERNAME", USERNAME)
    monkeypatch.setenv("PARCELLAB_WEBHOOK_PASSWORD", PASSWORD)


class TestAuthentication:
    def test_accepts_correct_basic_credentials(self):
        res = post(DELIVERED, {"Authorization": basic()})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lowercase_scheme_and_password_with_colons(self):
        assert post(DELIVERED, {"Authorization": basic().replace("Basic", "basic")}).status_code == 200

    def test_accepts_non_ascii_credentials(self, monkeypatch):
        monkeypatch.setenv("PARCELLAB_WEBHOOK_PASSWORD", "pässwörd-日本")
        assert post(DELIVERED, {"Authorization": basic(USERNAME, "pässwörd-日本")}).status_code == 200

    def test_rejects_missing_header(self):
        assert post(DELIVERED).status_code == 401

    def test_rejects_wrong_password(self):
        assert post(DELIVERED, {"Authorization": basic(USERNAME, "nope")}).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(DELIVERED, {"Authorization": basic("someone", PASSWORD)}).status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(DELIVERED, {"Authorization": f"Bearer {PASSWORD}"}).status_code == 401

    def test_rejects_invalid_base64_or_missing_colon(self):
        assert post(DELIVERED, {"Authorization": "Basic !!!not-base64!!!"}).status_code == 401
        no_colon = "Basic " + base64.b64encode(b"parcellab").decode()
        assert post(DELIVERED, {"Authorization": no_colon}).status_code == 401

    def test_rejects_everything_when_unconfigured(self):
        assert verify_parcellab_request({"authorization": basic()}, {}) is False
        assert verify_parcellab_request({"authorization": basic("", "")}, {}) is False

    def test_authenticates_before_parsing(self):
        assert post("{not json", {"Authorization": basic(USERNAME, "nope")}).status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post(DELIVERED, {"Authorization": basic()}, "text/plain").status_code == 200

    def test_invalid_json_after_auth_is_400(self):
        assert post("{not json", {"Authorization": basic()}).status_code == 400

    def test_non_object_json_is_400(self):
        assert post("[1,2]", {"Authorization": basic()}).status_code == 400


class TestEvents:
    @pytest.mark.parametrize(
        "event",
        [
            "onCreated", "onUpdated", "onDispatch", "onScheduled", "onDelay", "onInternalDelay",
            "onOutForDelivery", "onFailedAttempt", "onPickupReady", "onDelivered", "onReturn",
        ],
    )
    def test_handles_event(self, event, capsys):
        res = post({**DELIVERED, "event": event}, {"Authorization": basic()})
        assert res.status_code == 200
        assert "Unhandled parcelLab event" not in capsys.readouterr().out

    def test_acknowledges_unknown_event(self, capsys):
        res = post({**DELIVERED, "event": "onSomethingNew"}, {"Authorization": basic()})
        assert res.status_code == 200
        assert "Unhandled parcelLab event: onSomethingNew" in capsys.readouterr().out

    def test_reads_event_from_cloudevents_type(self, capsys):
        cloud_event = {
            "specversion": "1.0",
            "type": "com.parcellab.tracking.event.outfordelivery",
            "data": {"references": {"tracking_number": "00340000000001"}},
        }
        assert get_event_name(cloud_event) == "onOutForDelivery"
        res = post(cloud_event, {"Authorization": basic()}, "application/cloudevents+json")
        assert res.status_code == 200
        assert "Shipment 00340000000001 is out for delivery" in capsys.readouterr().out
