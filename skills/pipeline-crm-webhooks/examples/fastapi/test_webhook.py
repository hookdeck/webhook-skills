# Generated with: pipeline-crm-webhooks skill
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

# Standard Webhooks secrets look like "whsec_" + base64(key bytes). The HMAC
# key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"pipeline-crm-test-key-0123456789").decode()

os.environ["PIPELINE_CRM_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Pipeline CRM does: HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/pipeline-crm", content=raw_body, headers=headers)


def payload(model: str, action: str, **extra) -> str:
    return json.dumps(
        {
            "trigger": "Deal stage changed",
            "timestamp": "2026-09-03 14:22:07",
            "event_model": model,
            "event_action": action,
            "event_model_id": 4521,
            "event_data": {"id": 4521, "name": "Acme Corporation - Q4 renewal", "deal_stage_id": 4, "value": 12000.0},
            "caused_by_user": {"id": 13, "email": "sam.okafor@northwind.example"},
            **extra,
        }
    )


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["PIPELINE_CRM_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["PIPELINE_CRM_WEBHOOK_SECRET"] = SECRET


class TestValidSignatures:
    def test_accepts_deal_create(self, caplog):
        body = payload("deal", "create")
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Deal created: 4521" in caplog.text

    def test_accepts_deal_update_and_reports_changes(self, caplog):
        body = payload("deal", "update", event_changes={"deal_stage_id": [3, 4]})
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "deal_stage_id" in caplog.text

    def test_accepts_person_create(self, caplog):
        body = payload("person", "create")
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Person created" in caplog.text

    def test_accepts_company_destroy(self, caplog):
        body = payload("company", "destroy")
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Company deleted" in caplog.text

    def test_acknowledges_unknown_event_types(self, caplog):
        body = payload("task", "create")
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Pipeline CRM event: task.create" in caplog.text

    def test_verifies_any_content_type(self):
        body = payload("deal", "create")
        res = post(body, signed_headers(body, content_type="text/plain"))
        assert res.status_code == 200

    def test_accepts_when_any_of_several_signatures_matches(self):
        body = payload("deal", "create")
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_duplicate_delivery_id_returns_200(self):
        body = payload("deal", "create")
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_rejects_unsigned_delivery(self):
        res = post(payload("deal", "create"), {"content-type": "application/json"})
        assert res.status_code == 400

    def test_rejects_bad_signature(self):
        body = payload("deal", "create")
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_rejects_other_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = payload("deal", "create")
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_rejects_tampered_body(self):
        body = payload("deal", "create")
        headers = signed_headers(body)
        assert post(body.replace("12000", "99000"), headers).status_code == 400

    def test_rejects_timestamp_outside_tolerance(self):
        body = payload("deal", "create")
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_rejects_undecoded_secret_key(self):
        body = payload("deal", "create")
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        res = post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestFailClosed:
    def test_returns_500_without_secret(self):
        del os.environ["PIPELINE_CRM_WEBHOOK_SECRET"]
        body = payload("deal", "create")
        assert post(body, signed_headers(body)).status_code == 500
