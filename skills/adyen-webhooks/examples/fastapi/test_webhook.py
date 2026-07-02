import base64
import os

import pytest
from fastapi.testclient import TestClient

# A valid HEX HMAC key (as generated in the Adyen Customer Area) must be set
# before importing the app.
HMAC_KEY = "44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056"
os.environ["ADYEN_HMAC_KEY"] = HMAC_KEY

from main import app, calculate_hmac, is_valid_hmac  # noqa: E402

client = TestClient(app)


def base_item(**overrides) -> dict:
    item = {
        "pspReference": "7914073381342284",
        "originalReference": "",
        "merchantAccountCode": "TestMerchant",
        "merchantReference": "TestPayment-1407325143704",
        "amount": {"value": 1130, "currency": "EUR"},
        "eventCode": "AUTHORISATION",
        "success": "true",
    }
    item.update(overrides)
    return item


def signed(item: dict) -> dict:
    signature = calculate_hmac(item, HMAC_KEY)
    return {**item, "additionalData": {"hmacSignature": signature}}


def body_for(item: dict) -> dict:
    return {"live": "false", "notificationItems": [{"NotificationRequestItem": item}]}


class TestCalculateHmac:
    def test_matches_adyen_reference_signature(self):
        # Adyen's documented example signature for this exact item + key.
        expected = "coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0="
        assert calculate_hmac(base_item(), HMAC_KEY) == expected

    def test_valid_signature_passes(self):
        assert is_valid_hmac(signed(base_item()), HMAC_KEY) is True

    def test_tampered_amount_fails(self):
        item = signed(base_item())
        item["amount"]["value"] = 9999
        assert is_valid_hmac(item, HMAC_KEY) is False

    def test_missing_signature_fails(self):
        assert is_valid_hmac(base_item(), HMAC_KEY) is False


class TestAdyenWebhook:
    def test_valid_signature_returns_200_and_accepted(self):
        response = client.post("/webhooks/adyen", json=body_for(signed(base_item())))
        assert response.status_code == 200
        assert response.text == "[accepted]"

    def test_invalid_signature_returns_401(self):
        item = {**base_item(), "additionalData": {"hmacSignature": "invalid_signature"}}
        response = client.post("/webhooks/adyen", json=body_for(item))
        assert response.status_code == 401

    def test_missing_signature_returns_401(self):
        response = client.post("/webhooks/adyen", json=body_for(base_item()))
        assert response.status_code == 401

    def test_malformed_body_returns_400(self):
        response = client.post("/webhooks/adyen", json={"foo": "bar"})
        assert response.status_code == 400

    def test_handles_common_event_codes(self):
        event_codes = [
            "AUTHORISATION",
            "CAPTURE",
            "CAPTURE_FAILED",
            "REFUND",
            "REFUND_FAILED",
            "CANCELLATION",
            "CANCEL_OR_REFUND",
            "CHARGEBACK",
            "NOTIFICATION_OF_CHARGEBACK",
            "REPORT_AVAILABLE",
        ]
        for event_code in event_codes:
            item = signed(base_item(eventCode=event_code))
            response = client.post("/webhooks/adyen", json=body_for(item))
            assert response.status_code == 200, f"Failed for {event_code}"
            assert response.text == "[accepted]"

    def test_rejects_batch_when_any_item_invalid(self):
        good = {"NotificationRequestItem": signed(base_item())}
        bad = {
            "NotificationRequestItem": {
                **base_item(eventCode="CAPTURE"),
                "additionalData": {"hmacSignature": "nope"},
            }
        }
        response = client.post(
            "/webhooks/adyen",
            json={"live": "false", "notificationItems": [good, bad]},
        )
        assert response.status_code == 401


class TestBasicAuth:
    def setup_method(self):
        os.environ["ADYEN_WEBHOOK_USERNAME"] = "user"
        os.environ["ADYEN_WEBHOOK_PASSWORD"] = "pass"

    def teardown_method(self):
        os.environ.pop("ADYEN_WEBHOOK_USERNAME", None)
        os.environ.pop("ADYEN_WEBHOOK_PASSWORD", None)

    def test_missing_credentials_returns_401(self):
        response = client.post("/webhooks/adyen", json=body_for(signed(base_item())))
        assert response.status_code == 401

    def test_correct_credentials_returns_200(self):
        creds = base64.b64encode(b"user:pass").decode()
        response = client.post(
            "/webhooks/adyen",
            json=body_for(signed(base_item())),
            headers={"Authorization": f"Basic {creds}"},
        )
        assert response.status_code == 200
        assert response.text == "[accepted]"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
