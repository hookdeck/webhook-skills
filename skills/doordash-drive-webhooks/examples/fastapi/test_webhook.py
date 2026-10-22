import json
import os

# Whatever text is entered in the Developer Portal is sent verbatim; here a "Bearer"-style value
CRED = "Bearer ddk_9f2c1a7e4b6d4e0c8a31"
os.environ["DOORDASH_DRIVE_AUTHORIZATION"] = CRED

from fastapi.testclient import TestClient

from main import app, classify, verify_doordash_drive_request

client = TestClient(app)


def delivery(event_name):
    # Shape from DoorDash's documented example payload (trimmed)
    return {
        "created_at": "2022-02-01T23:18:22.791883Z",
        "event_name": event_name,
        "external_delivery_id": "c19a5d37-e457-4247-9a67-921ec0134125",
        "dasher_id": 123212,
        "dasher_name": "John D.",
        "dasher_location": {"lat": 43.333333333, "lng": -79.333333333},
    }


# Refund webhooks have no event_name
REFUND = {
    "event_data": {
        "reason": "delivered_late",
        "reason_comments": "order_ready_dasher_late_time_period_1",
        "amount": "750",
        "currency_code": "USD",
        "order_details": {"order_value": 5000, "tip": 200, "delivery_charge": 599},
    }
}

EVENT_NAMES = [
    "DASHER_CONFIRMED", "DASHER_CONFIRMED_PICKUP_ARRIVAL", "DASHER_PICKED_UP",
    "DASHER_CONFIRMED_DROPOFF_ARRIVAL", "DASHER_DROPPED_OFF", "DELIVERY_CANCELLED",
    "DELIVERY_RETURN_INITIALIZED", "DASHER_CONFIRMED_RETURN_ARRIVAL", "DELIVERY_RETURNED",
    "DELIVERY_BATCHED", "dasher_enroute_to_pickup", "dasher_enroute_to_dropoff",
    "dasher_enroute_to_return",
]


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(delivery("DASHER_CONFIRMED"))
    return client.post(
        "/webhooks/doordash-drive",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestDoorDashDriveWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": CRED})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_credential(self):
        assert post(headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_does_not_strip_scheme_prefix(self):
        assert post(headers={"Authorization": CRED.replace("Bearer ", "")}).status_code == 401

    def test_accepts_bare_token_without_decoding_as_basic(self, monkeypatch):
        monkeypatch.setenv("DOORDASH_DRIVE_AUTHORIZATION", "my-bare-token")
        assert post(headers={"Authorization": "my-bare-token"}).status_code == 200

    def test_rejects_credential_differing_only_in_length(self):
        assert post(headers={"Authorization": CRED + "x"}).status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(delivery("DASHER_DROPPED_OFF")), {"Authorization": CRED}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": CRED}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": CRED}).status_code == 400

    def test_accepts_every_documented_event(self):
        for name in EVENT_NAMES:
            assert post(json.dumps(delivery(name)), {"Authorization": CRED}).status_code == 200

    def test_accepts_refund_without_event_name(self):
        assert post(json.dumps(REFUND), {"Authorization": CRED}).status_code == 200


class TestHelpers:
    def test_classify(self):
        assert classify(delivery("DASHER_PICKED_UP")) == "DASHER_PICKED_UP"
        assert classify(REFUND) == "refund"
        assert classify({"foo": 1}) is None

    def test_never_accepts_when_unconfigured(self):
        assert verify_doordash_drive_request({"authorization": "x"}, {}) is False
        assert verify_doordash_drive_request({"authorization": ""}, {"DOORDASH_DRIVE_AUTHORIZATION": ""}) is False

    def test_non_ascii_credential_does_not_raise(self):
        cfg = {"DOORDASH_DRIVE_AUTHORIZATION": "tökén"}
        assert verify_doordash_drive_request({"authorization": "tökén"}, cfg) is True
        assert verify_doordash_drive_request({"authorization": "token"}, cfg) is False
