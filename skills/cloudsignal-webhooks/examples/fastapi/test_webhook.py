import os

from fastapi.testclient import TestClient

# Set the test Webhook API key before importing the app
os.environ["CLOUDSIGNAL_WEBHOOK_APIKEY"] = "test_webhook_apikey_13b3f8a9c2"

from main import app, verify_api_key, KNOWN_EVENT_TYPES

client = TestClient(app)

APIKEY = os.environ["CLOUDSIGNAL_WEBHOOK_APIKEY"]


def signal(**overrides):
    """A representative CloudSignal signal body. The apikey is carried IN the body."""
    body = {
        "apikey": APIKEY,
        "type": "CloudprinterOrderValidated",
        "order": "73O1230A",
        "order_reference": "ref-order-123",
        "item": "73O1230A-1",
        "item_reference": "ref-item-1",
        "datetime": "2017-01-21T13:23:42+00:00",
    }
    body.update(overrides)
    return body


class TestVerifyApiKey:
    def test_key_matches(self):
        assert verify_api_key(APIKEY, APIKEY) is True

    def test_wrong_key(self):
        assert verify_api_key("nope", APIKEY) is False

    def test_missing_provided_key(self):
        assert verify_api_key(None, APIKEY) is False

    def test_missing_expected_key(self):
        assert verify_api_key(APIKEY, None) is False

    def test_length_mismatch_no_throw(self):
        assert verify_api_key(APIKEY + "x", APIKEY) is False


class TestCloudSignalWebhook:
    def test_missing_apikey_returns_401(self):
        body = signal()
        del body["apikey"]
        response = client.post("/webhooks/cloudsignal", json=body)
        assert response.status_code == 401

    def test_wrong_apikey_returns_401(self):
        response = client.post("/webhooks/cloudsignal", json=signal(apikey="wrong_key"))
        assert response.status_code == 401

    def test_valid_signal_returns_200(self):
        response = client.post("/webhooks/cloudsignal", json=signal())
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_dispatches_every_known_type(self):
        for signal_type in KNOWN_EVENT_TYPES:
            response = client.post("/webhooks/cloudsignal", json=signal(type=signal_type))
            assert response.status_code == 200, f"Failed for type: {signal_type}"

    def test_item_shipped_with_tracking(self):
        response = client.post(
            "/webhooks/cloudsignal",
            json=signal(
                type="ItemShipped",
                tracking="1Z999AA10123456784",
                shipping_option="GLS",
            ),
        )
        assert response.status_code == 200

    def test_item_error_with_cause(self):
        response = client.post(
            "/webhooks/cloudsignal",
            json=signal(type="ItemError", cause="Artwork resolution too low"),
        )
        assert response.status_code == 200

    def test_unknown_type_acknowledged_with_200(self):
        response = client.post("/webhooks/cloudsignal", json=signal(type="SomeFutureSignal"))
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
