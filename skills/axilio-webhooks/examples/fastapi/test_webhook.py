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

# Axilio secrets are "whsec_" + base64(key bytes).
# The HMAC key is the base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"axilio-test-signing-key-01234567").decode()

os.environ["AXILIO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

ALL_EVENT_TYPES = [
    "run.started",
    "run.completed",
    "run.failed",
    "run.cancelled",
    "session.started",
    "session.ended",
    "session.recording_ready",
    "balance.low",
    "balance.depleted",
    "balance.recovered",
    "invoice.paid",
    "invoice.payment_failed",
    "subscription.updated",
    "subscription.canceled",
    "auto_recharge.succeeded",
    "auto_recharge.failed",
    "file.ready",
    "file.capture_failed",
    "file.delivered",
    "file.delivery_failed",
    "phone.maintenance_started",
    "phone.maintenance_ended",
    "phone.offline",
    "phone.online",
    "phone.rental.activated",
    "phone.rental.past_due",
    "phone.rental.canceled",
    "webhook.test",
]
RESOURCE = "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11"


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Axilio (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def make_event(event_type: str, data=None, test: bool = False) -> dict:
    return {
        "id": f"{event_type}:{uuid.uuid4()}",
        "type": event_type,
        "occurred_at": "2026-09-24T12:00:45Z",
        "test": test,
        "data": data or {},
    }


def run_completed() -> dict:
    return make_event(
        "run.completed",
        {
            "id": RESOURCE,
            "workflow_id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a22",
            "status": "completed",
            "trigger": "api",
            "success": True,
        },
    )


def signed_headers(raw_body: str, id=None, timestamp=None, secret=SECRET, signature=None, content_type="application/json"):
    msg_id = id or json.loads(raw_body)["id"]
    ts = str(now() if timestamp is None else timestamp)
    return {
        "content-type": content_type,
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/axilio", content=raw_body.encode(), headers=headers)


@pytest.fixture(autouse=True)
def _secret_env(monkeypatch):
    monkeypatch.setenv("AXILIO_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    @pytest.mark.parametrize("event_type", ALL_EVENT_TYPES)
    def test_accepts_every_documented_event_type(self, event_type, caplog):
        body = json.dumps(make_event(event_type))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_logs_the_run_id_for_run_completed(self, caplog):
        body = json.dumps(run_completed())
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert f"Run {RESOURCE} completed" in caplog.text

    def test_reports_the_cancellation_reason(self, caplog):
        body = json.dumps(make_event("run.cancelled", {"id": RESOURCE, "reason": "queue_timeout"}))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert f"Run {RESOURCE} cancelled (queue_timeout)" in caplog.text

    def test_acknowledges_dashboard_test_deliveries_without_acting(self, caplog):
        body = json.dumps(make_event("run.failed", {"id": RESOURCE}, test=True))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Test delivery received: run.failed" in caplog.text
        assert f"Run {RESOURCE} failed" not in caplog.text

    def test_acknowledges_unknown_event_types(self, caplog):
        body = json.dumps(make_event("run.something_new"))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Axilio event type: run.something_new" in caplog.text

    @pytest.mark.parametrize(
        "content_type", ["text/plain", "application/octet-stream", "application/vnd.axilio+json"]
    )
    def test_verifies_raw_bytes_for_any_content_type(self, content_type):
        body = json.dumps(run_completed())
        res = post(body, signed_headers(body, content_type=content_type))
        assert res.status_code == 200

    def test_verifies_non_ascii_body_byte_for_byte(self):
        body = json.dumps(
            make_event("phone.online", {"phone_id": "k3Vq8ZrT2mXa", "phone_name": "Pixel é 日本"}),
            ensure_ascii=False,
        )
        res = client.post(
            "/webhooks/axilio",
            content=body.encode("utf-8"),
            headers=signed_headers(body),
        )
        assert res.status_code == 200

    def test_accepts_when_any_space_separated_signature_matches(self):
        body = json.dumps(run_completed())
        headers = signed_headers(body)
        headers["webhook-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWc= {headers['webhook-signature']}"
        assert post(body, headers).status_code == 200

    def test_returns_200_for_redeliveries_of_the_same_event_id(self):
        body = json.dumps(run_completed())
        first = post(body, signed_headers(body))
        second = post(body, signed_headers(body))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_rejects_missing_signature_headers(self):
        body = json.dumps(run_completed())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_rejects_an_empty_body(self):
        headers = {
            "webhook-id": "x",
            "webhook-timestamp": str(now()),
            "webhook-signature": "v1,aW52YWxpZA==",
        }
        assert post("", headers).status_code == 400

    def test_rejects_a_bad_signature(self):
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_rejects_a_signature_made_with_a_different_secret(self):
        other = "whsec_" + base64.b64encode(b"some-other-secret-key-0123456789").decode()
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_rejects_a_tampered_body(self):
        body = json.dumps(run_completed())
        headers = signed_headers(body)
        assert post(body.replace("completed", "failed"), headers).status_code == 400

    def test_rejects_a_timestamp_outside_the_library_tolerance(self):
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_rejects_signatures_keyed_with_the_undecoded_secret_string(self):
        body = json.dumps(run_completed())
        msg_id = json.loads(body)["id"]
        ts = str(now())
        wrong = base64.b64encode(
            hmac.new(
                SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
            ).digest()
        ).decode()
        headers = signed_headers(body, id=msg_id, timestamp=ts, signature=f"v1,{wrong}")
        assert post(body, headers).status_code == 400


class TestFailClosed:
    def test_returns_500_when_the_secret_is_not_set(self, monkeypatch):
        monkeypatch.delenv("AXILIO_WEBHOOK_SECRET", raising=False)
        body = json.dumps(run_completed())
        assert post(body, signed_headers(body)).status_code == 500
