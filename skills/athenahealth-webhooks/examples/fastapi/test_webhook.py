import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_x_hub_secret"
os.environ["ATHENAHEALTH_WEBHOOK_SECRET"] = SECRET

from main import app, verify_athenahealth_webhook  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def bundle(topic: str, count: int = 1) -> bytes:
    """Subscription notification Bundle: SubscriptionStatus first, then one AuditEvent per event."""
    ids = [f"cb6cc377-ee38-31ba-9482-f93f821cd16{i}" for i in range(count)]
    return json.dumps(
        {
            "resourceType": "Bundle",
            "id": "3945182f-d315-4dbf-9259-09d863c7e7da",
            "type": "history",
            "timestamp": "2021-03-31T16:20:01.123Z",
            "entry": [
                {
                    "resource": {
                        "resourceType": "SubscriptionStatus",
                        "status": "active",
                        "type": "event-notification",
                        "eventsInNotification": count,
                        "subscription": {"reference": "Subscription/a9c3784c-9f56-4b32-95b0-882868d39e58"},
                        "topic": f"https://api.platform.athenahealth.com/fhir/r4/SubscriptionTopic/{topic}",
                        "notificationEvent": [
                            {
                                "eventNumber": str(i + 1),
                                "id": event_id,
                                "timestamp": "2021-03-31T16:20:12.000Z",
                                "focus": {"reference": f"Appointment/a-432.{i + 1}"},
                            }
                            for i, event_id in enumerate(ids)
                        ],
                    }
                },
                *[{"resource": {"resourceType": "AuditEvent", "id": i, "type": {"code": topic}}} for i in ids],
            ],
        }
    ).encode()


class TestVerify:
    body = bundle("Appointment.schedule")

    def test_valid(self):
        assert verify_athenahealth_webhook(self.body, sign(self.body), SECRET) is True

    def test_uppercase_hex(self):
        upper = "sha256=" + sign(self.body)[7:].upper()
        assert verify_athenahealth_webhook(self.body, upper, SECRET) is True

    def test_wrong_secret(self):
        assert verify_athenahealth_webhook(self.body, sign(self.body, "other"), SECRET) is False

    def test_tampered_body(self):
        assert verify_athenahealth_webhook(bundle("Appointment.cancel"), sign(self.body), SECRET) is False

    def test_missing_secret(self):
        assert verify_athenahealth_webhook(self.body, sign(self.body), None) is False

    @pytest.mark.parametrize(
        "header",
        ["garbage", "sha1=abc", "sha512=abc", "sha256=", "sha256=abc", "sha256=" + "z" * 64, "", None],
    )
    def test_malformed_header(self, header):
        assert verify_athenahealth_webhook(self.body, header, SECRET) is False

    def test_non_ascii_header_is_false_not_error(self):
        assert verify_athenahealth_webhook(self.body, "sha256=" + "é" * 64, SECRET) is False


class TestEndpoint:
    @pytest.mark.parametrize(
        "topic",
        [
            "Appointment.schedule", "Appointment.cancel", "Appointment.reschedule",
            "Appointment.check-in", "Appointment.update",
            "Encounter.check-in", "Encounter.signoff",
            "LabResult.create", "LabResult.close",
            "Patient.create", "Patient.update",
        ],
    )
    def test_signed_topics_accepted(self, topic):
        body = bundle(topic)
        r = client.post(
            "/webhooks/athenahealth",
            content=body,
            headers={"X-Hub-Signature": sign(body), "Content-Type": "application/fhir+json"},
        )
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_batched_notification(self):
        body = bundle("Appointment.schedule", 3)
        r = client.post("/webhooks/athenahealth", content=body, headers={"X-Hub-Signature": sign(body)})
        assert r.status_code == 200

    def test_any_content_type_verifies(self):
        body = bundle("Appointment.cancel")
        r = client.post(
            "/webhooks/athenahealth",
            content=body,
            headers={"X-Hub-Signature": sign(body), "Content-Type": "text/plain"},
        )
        assert r.status_code == 200

    def test_unknown_topic_acknowledged(self):
        body = bundle("Something.else")
        r = client.post("/webhooks/athenahealth", content=body, headers={"X-Hub-Signature": sign(body)})
        assert r.status_code == 200

    def test_invalid_signature(self):
        body = bundle("Appointment.schedule")
        r = client.post("/webhooks/athenahealth", content=body, headers={"X-Hub-Signature": sign(body, "wrong")})
        assert r.status_code == 401

    def test_non_sha256_method(self):
        body = bundle("Appointment.schedule")
        r = client.post(
            "/webhooks/athenahealth",
            content=body,
            headers={"X-Hub-Signature": sign(body).replace("sha256", "sha512")},
        )
        assert r.status_code == 401

    def test_non_ascii_header_returns_401(self):
        body = bundle("Appointment.schedule")
        r = client.post(
            "/webhooks/athenahealth",
            content=body,
            headers=[(b"x-hub-signature", ("sha256=" + "é" * 64).encode("utf-8"))],
        )
        assert r.status_code == 401

    def test_missing_signature(self):
        r = client.post("/webhooks/athenahealth", content=bundle("Appointment.schedule"))
        assert r.status_code == 401

    def test_signed_invalid_json(self):
        body = b"not json"
        r = client.post("/webhooks/athenahealth", content=body, headers={"X-Hub-Signature": sign(body)})
        assert r.status_code == 400

    @pytest.mark.parametrize("payload", [{"resourceType": "Patient"}, [], {"resourceType": "Bundle", "entry": []}])
    def test_signed_non_notification_bundle(self, payload):
        body = json.dumps(payload).encode()
        r = client.post("/webhooks/athenahealth", content=body, headers={"X-Hub-Signature": sign(body)})
        assert r.status_code == 400
