import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Cal.com secrets are free-form strings chosen by the user.
SECRET = "test_calcom_webhook_secret"
os.environ["CALCOM_WEBHOOK_SECRET"] = SECRET

from main import app, verify_cal_com_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: str, key: str = SECRET) -> str:
    """Generate a Cal.com signature: hex(HMAC-SHA256(secret, raw_body)), no prefix."""
    return hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def booking_event(trigger: str, **extra) -> str:
    return json.dumps(
        {
            "triggerEvent": trigger,
            "createdAt": "2024-01-01T00:00:00.000Z",
            "payload": {
                "uid": "unique-booking-id",
                "bookingId": 100,
                "title": "Strategy Session between Organizer and Guest",
                "startTime": "2024-01-01T10:00:00Z",
                "endTime": "2024-01-01T10:15:00Z",
                "organizer": {"name": "Organizer Name", "email": "organizer@example.com"},
                "attendees": [{"name": "Guest User", "email": "guest@example.com"}],
                **extra,
            },
        }
    )


def post(body: str, signature=None):
    headers = {"Content-Type": "application/json", "X-Cal-Webhook-Version": "2021-10-20"}
    if signature is not None:
        headers["X-Cal-Signature-256"] = signature
    return client.post("/webhooks/cal-com", content=body, headers=headers)


class TestVerifyCalComWebhook:
    body = booking_event("BOOKING_CREATED")

    def test_valid_signature(self):
        assert verify_cal_com_webhook(self.body.encode(), sign(self.body), SECRET) is True

    def test_wrong_secret(self):
        assert verify_cal_com_webhook(self.body.encode(), sign(self.body, "wrong"), SECRET) is False

    def test_tampered_body(self):
        tampered = self.body.replace("Guest User", "Mallory")
        assert verify_cal_com_webhook(tampered.encode(), sign(self.body), SECRET) is False

    def test_prefixed_value_rejected(self):
        assert verify_cal_com_webhook(self.body.encode(), f"sha256={sign(self.body)}", SECRET) is False

    def test_no_secret_provided_and_missing_values(self):
        assert verify_cal_com_webhook(self.body.encode(), "no-secret-provided", SECRET) is False
        assert verify_cal_com_webhook(self.body.encode(), None, SECRET) is False
        assert verify_cal_com_webhook(self.body.encode(), sign(self.body), None) is False


class TestCalComWebhook:
    def test_missing_signature_returns_400(self):
        response = post(booking_event("BOOKING_CREATED"))
        assert response.status_code == 400
        assert response.json()["detail"] == "Missing signature header"

    def test_invalid_signature_returns_400(self):
        response = post(booking_event("BOOKING_CREATED"), "a" * 64)
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_unsigned_webhook_returns_400(self):
        response = post(booking_event("BOOKING_CREATED"), "no-secret-provided")
        assert response.status_code == 400

    @pytest.mark.parametrize(
        "trigger,extra",
        [
            ("BOOKING_CREATED", {}),
            ("BOOKING_RESCHEDULED", {"rescheduleUid": "previous-booking-id"}),
            ("BOOKING_CANCELLED", {"cancellationReason": "Conflict"}),
            ("BOOKING_PAID", {"paymentId": 500}),
            ("SOME_FUTURE_EVENT", {}),
        ],
    )
    def test_signed_events_return_200(self, trigger, extra):
        body = booking_event(trigger, **extra)
        response = post(body, sign(body))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_flat_meeting_ended_payload(self):
        body = json.dumps(
            {
                "triggerEvent": "MEETING_ENDED",
                "id": 100,
                "uid": "unique-booking-identifier",
                "title": "Strategy Session",
            }
        )
        response = post(body, sign(body))
        assert response.status_code == 200

    def test_signed_non_json_body_returns_400(self):
        body = "type=intro-call&name=Guest"
        response = post(body, sign(body))
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON"

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("CALCOM_WEBHOOK_SECRET")
        body = booking_event("BOOKING_CREATED")
        response = post(body, sign(body))
        assert response.status_code == 500


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
