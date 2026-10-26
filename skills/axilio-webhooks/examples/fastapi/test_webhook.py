# Generated with: axilio-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import pytest

# Axilio secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"axilio-test-signing-key-0123456789").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"another-destination-key-000000").decode()

os.environ["AXILIO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, processed_event_ids  # noqa: E402

client = TestClient(app)

EVENT_TYPES = [
    "run.started", "run.completed", "run.failed", "run.cancelled",
    "session.started", "session.ended", "session.recording_ready",
    "balance.low", "balance.depleted", "balance.recovered",
    "invoice.paid", "invoice.payment_failed",
    "subscription.updated", "subscription.canceled",
    "auto_recharge.succeeded", "auto_recharge.failed",
    "file.ready", "file.capture_failed", "file.delivered", "file.delivery_failed",
    "phone.maintenance_started", "phone.maintenance_ended", "phone.offline", "phone.online",
    "phone.rental.activated", "phone.rental.past_due", "phone.rental.canceled",
    "webhook.test",
]


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Axilio does: Standard Webhooks, HMAC-SHA256, base64."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    msg_id = msg_id or f"run.completed:{uuid.uuid4()}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature if signature is not None else sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body, headers):
    return client.post("/webhooks/axilio", content=raw_body, headers=headers)


def event(event_type, data=None):
    return {
        "id": f"{event_type}:0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11",
        "type": event_type,
        "occurred_at": "2026-09-24T12:00:45Z",
        "test": False,
        "data": data or {},
    }


def run_completed():
    return event("run.completed", {
        "id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11",
        "workflow_id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a22",
        "device_class": "phone",
        "phone_id": "k3Vq8ZrT2mXa",
        "session_id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a33",
        "status": "completed",
        "trigger": "api",
        "started_at": "2026-09-24T12:00:00Z",
        "completed_at": "2026-09-24T12:00:45Z",
        "success": True,
        "created_at": "2026-09-24T11:59:57Z",
    })


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("AXILIO_WEBHOOK_SECRET", SECRET)
    processed_event_ids.clear()


class TestValidSignatures:
    def test_accepts_run_completed_and_logs_the_run(self, caplog):
        body = json.dumps(run_completed())
        with caplog.at_level(logging.INFO, logger="axilio-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "run.completed: run 0199a3c2" in caplog.text

    @pytest.mark.parametrize("event_type", EVENT_TYPES)
    def test_accepts_every_documented_event(self, event_type, caplog):
        body = json.dumps(event(event_type))
        with caplog.at_level(logging.INFO, logger="axilio-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_unknown_event_type_is_logged_but_acknowledged(self, caplog):
        body = json.dumps(event("run.paused"))
        with caplog.at_level(logging.INFO, logger="axilio-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Axilio event type: run.paused" in caplog.text

    def test_verifies_raw_body_whatever_the_content_type(self):
        body = json.dumps(run_completed())
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_verifies_unusual_whitespace_byte_for_byte(self):
        body = json.dumps(run_completed(), indent=4)
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_dashboard_test_event(self):
        payload = event("webhook.test", {"message": "This is a test event from Axilio."})
        payload["test"] = True
        body = json.dumps(payload)
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_when_any_space_separated_v1_entry_matches(self):
        body = json.dumps(run_completed())
        msg_id, ts = "run.completed:multi", str(now())
        signature = f"{sign(body, msg_id, ts, OTHER_SECRET)} {sign(body, msg_id, ts)}"
        assert post(body, signed_headers(body, msg_id, ts, signature=signature)).status_code == 200

    def test_ignores_non_v1_entries_such_as_v1a(self):
        body = json.dumps(run_completed())
        msg_id, ts = "run.completed:v1a", str(now())
        good = sign(body, msg_id, ts)
        v1a = good.replace("v1,", "v1a,", 1)
        assert post(body, signed_headers(body, msg_id, ts, signature=v1a)).status_code == 400
        assert post(body, signed_headers(body, msg_id, ts, signature=f"{v1a} {good}")).status_code == 200

    def test_falls_back_to_svix_headers_when_webhook_id_is_absent(self):
        body = json.dumps(run_completed())
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}


class TestInvalidRequests:
    def test_rejects_tampered_body(self):
        body = json.dumps(run_completed())
        headers = signed_headers(body)
        res = post(body.replace("completed", "failed"), headers)
        assert res.status_code == 400
        assert res.json() == {"detail": "Invalid signature"}

    def test_rejects_another_destinations_secret(self):
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body, secret=OTHER_SECRET)).status_code == 400

    def test_rejects_timestamp_older_than_five_minutes(self):
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_rejects_timestamp_too_far_in_the_future(self):
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body, timestamp=now() + 600)).status_code == 400

    def test_rejects_garbage_signature(self):
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body, signature="v1,not-a-real-signature")).status_code == 400

    def test_rejects_missing_headers(self):
        body = json.dumps(run_completed())
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400
        assert res.json() == {"detail": "Missing signature headers"}

    def test_rejects_partial_headers(self):
        body = json.dumps(run_completed())
        headers = signed_headers(body)
        del headers["webhook-signature"]
        assert post(body, headers).status_code == 400


class TestFailClosed:
    def test_returns_500_and_never_processes_without_a_secret(self, monkeypatch, caplog):
        monkeypatch.delenv("AXILIO_WEBHOOK_SECRET")
        body = json.dumps(run_completed())
        with caplog.at_level(logging.INFO, logger="axilio-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 500
        assert "run.completed:" not in caplog.text


class TestAtLeastOnceDelivery:
    def test_acknowledges_retries_as_duplicates_without_reprocessing(self, caplog):
        body = json.dumps(run_completed())
        msg_id = f"run.completed:{uuid.uuid4()}"
        first = post(body, signed_headers(body, msg_id))
        assert first.json() == {"received": True}
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="axilio-webhooks"):
            retry = post(body, signed_headers(body, msg_id))
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}
        assert "run.completed:" not in caplog.text


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
