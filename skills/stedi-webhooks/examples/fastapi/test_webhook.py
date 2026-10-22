# Generated with: stedi-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Stedi secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"stedi-test-signing-key-0123456789").decode()

os.environ["STEDI_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Stedi does (Standard Webhooks): HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = msg_id or f"msg_{uuid.uuid4()}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/stedi", content=raw_body, headers=headers)


def thin_event(event_type, resource, related=None):
    event = {
        "account": "11111111-2222-3333-4444-555555555555",
        "created": "2026-03-30T23:19:00.501Z",
        "environment": "PRODUCTION",
        "id": f"evt_{uuid.uuid4()}",
        "object": "v1.event",
        "resource": resource,
        "type": event_type,
    }
    if related:
        event["relatedResources"] = related
    return event


def enrollment_activated():
    return thin_event("enrollment.activated", {"id": "019bb508-dc63-73a1-8ddc-9d4720299072", "type": "enrollment"})


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("STEDI_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("STEDI_TIMESTAMP_TOLERANCE_SECONDS", raising=False)


class TestValidSignatures:
    def test_accepts_enrollment_activated(self, caplog):
        caplog.set_level("INFO")
        body = json.dumps(enrollment_activated())
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "is LIVE" in caplog.text

    def test_accepts_transaction_processed(self, caplog):
        caplog.set_level("INFO")
        body = json.dumps(
            thin_event(
                "transaction.processed",
                {"id": "019bb508-dc63-73a1-8ddc-9d4720299072", "type": "transaction"},
                [
                    {"id": "019bb508-dc63-73a1-8ddc-9d4720299072", "type": "transaction.x12.835"},
                    {"id": "01997873-bebb-7b33-81ef-f408866dfb2c", "type": "execution"},
                ],
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "transaction.x12.835" in caplog.text

    def test_accepts_file_failed(self, caplog):
        caplog.set_level("INFO")
        body = json.dumps(thin_event("file.failed", {"id": "019bb508-dc63", "type": "execution"}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "File failed" in caplog.text

    def test_accepts_event_ping(self):
        body = json.dumps(thin_event("event.ping", {"id": "dst_019d51b6-707c", "type": "destination"}))
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_non_json_content_type(self):
        body = json.dumps(enrollment_activated())
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps(thin_event("something.new", {"id": "x", "type": "x"}))
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_any_matching_signature_during_rotation(self):
        body = json.dumps(enrollment_activated())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_accepts_retry_with_old_creation_timestamp(self):
        body = json.dumps(enrollment_activated())
        assert post(body, signed_headers(body, timestamp=now() - 8 * 3600)).status_code == 200

    def test_duplicate_webhook_id_returns_200(self):
        body = json.dumps(enrollment_activated())
        msg_id = f"msg_{uuid.uuid4()}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(enrollment_activated())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature(self):
        body = json.dumps(enrollment_activated())
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_other_destinations_secret(self):
        other = "whsec_" + base64.b64encode(b"another-destination-secret-0123").decode()
        body = json.dumps(enrollment_activated())
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_tampered_body(self):
        body = json.dumps(enrollment_activated())
        headers = signed_headers(body)
        assert post(body.replace("PRODUCTION", "TEST"), headers).status_code == 400

    def test_rejects_timestamp_dot_body_without_id(self):
        body = json.dumps(enrollment_activated())
        ts = str(now())
        key = base64.b64decode(SECRET[len("whsec_"):])
        wrong = base64.b64encode(hmac.new(key, f"{ts}.{body}".encode(), hashlib.sha256).digest()).decode()
        assert post(body, signed_headers(body, timestamp=ts, signature=f"v1,{wrong}")).status_code == 400

    def test_rejects_undecoded_secret_key(self):
        body = json.dumps(enrollment_activated())
        msg_id, ts = f"msg_{uuid.uuid4()}", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}")
        assert post(body, headers).status_code == 400

    def test_timestamp_window_only_when_configured(self, monkeypatch):
        monkeypatch.setenv("STEDI_TIMESTAMP_TOLERANCE_SECONDS", "300")
        body = json.dumps(enrollment_activated())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400
        assert post(body, signed_headers(body)).status_code == 200


class TestFailClosed:
    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("STEDI_WEBHOOK_SECRET")
        body = json.dumps(enrollment_activated())
        assert post(body, signed_headers(body)).status_code == 500
