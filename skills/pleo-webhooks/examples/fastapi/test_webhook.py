# Generated with: pleo-webhooks skill
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

# Pleo subscription secrets look like "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD":
# "whsec_" + base64. The HMAC key is the base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"pleo-test-signing-key-0123456789").decode()

os.environ["PLEO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Svix / Standard Webhooks (the scheme Pleo delivers with)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = webhook_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/pleo", content=raw_body, headers=headers)


# Payloads match the examples in Pleo's Webhook Events reference.
def export_job_created() -> dict:
    return {
        "data": {
            "companyId": "b5fdaec1-1b43-4b62-996a-b0471c3bb336",
            "createdAt": "2025-05-23T15:21:32Z",
            "createdBy": "e3118b03-691c-4bd4-944e-1a9c1f1031b7",
            "expiresIn": 3600,
            "id": "b4c4d068-ebbe-45b7-b562-2f16f0deb8b9",
            "numberOfItems": 1,
            "status": "pending",
        },
        "eventId": str(uuid.uuid4()),
        "eventType": "v1.export-job.created",
    }


def vendor_created() -> dict:
    return {
        "data": {
            "id": "c27ed4d6-3d3d-458e-8f3f-735fdf32a3bc",
            "companyId": "12abc3d4-e567-890e-1234-abc56e78fabc",
            "name": "Greenfield Logistics",
            "country": "GB",
            "registrationNumber": "",
            "taxRegistrationNumber": "GB987654321",
            "code": None,
            "state": "DRAFT",
            "defaultCurrency": "GBP",
            "createdBy": "22aff90a-a53d-4f0c-851f-dd4cc85ac947",
            "createdAt": "2026-07-08T10:05:43.530450712Z",
            "updatedAt": "2026-07-08T10:05:43.530450712Z",
            "deletedAt": None,
        },
        "eventType": "v1.vendor.created",
        "eventId": str(uuid.uuid4()),
    }


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("PLEO_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_accepts_export_job_created(self, caplog):
        body = json.dumps(export_job_created())
        with caplog.at_level(logging.INFO, logger="pleo-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Export job b4c4d068-ebbe-45b7-b562-2f16f0deb8b9 created" in caplog.text

    def test_accepts_vendor_created(self, caplog):
        body = json.dumps(vendor_created())
        with caplog.at_level(logging.INFO, logger="pleo-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Greenfield Logistics" in caplog.text

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps({"data": {}, "eventId": str(uuid.uuid4()), "eventType": "v1.something.new"})
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_accepts_when_any_of_several_signatures_matches(self):
        body = json.dumps(export_job_created())
        headers = signed_headers(body)
        headers["webhook-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWc= {headers['webhook-signature']}"
        res = post(body, headers)
        assert res.status_code == 200

    def test_retried_delivery_with_same_webhook_id_is_acknowledged(self):
        body = json.dumps(export_job_created())
        first = post(body, signed_headers(body, webhook_id="msg_retry_test"))
        second = post(body, signed_headers(body, webhook_id="msg_retry_test"))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_rejects_missing_headers(self):
        body = json.dumps(export_job_created())
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_rejects_bad_signature(self):
        body = json.dumps(export_job_created())
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_rejects_different_secret(self):
        other = "whsec_" + base64.b64encode(b"some-other-secret-key-0123456789").decode()
        body = json.dumps(export_job_created())
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_rejects_tampered_body(self):
        body = json.dumps(export_job_created())
        headers = signed_headers(body)
        res = post(body.replace("pending", "completed"), headers)
        assert res.status_code == 400

    def test_rejects_stale_timestamp(self):
        body = json.dumps(export_job_created())
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_rejects_signature_keyed_with_undecoded_secret(self):
        body = json.dumps(export_job_created())
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(
                SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
            ).digest()
        ).decode()
        res = post(body, signed_headers(body, webhook_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestFailClosed:
    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("PLEO_WEBHOOK_SECRET", raising=False)
        body = json.dumps(export_job_created())
        res = post(body, signed_headers(body))
        assert res.status_code == 500
