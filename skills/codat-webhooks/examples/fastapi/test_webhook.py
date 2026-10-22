# Generated with: codat-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Codat (Standard Webhooks) secrets look like "whsec_" + base64(key bytes), for example
# "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"codat-test-signing-key-0123456789ab").decode()

os.environ["CODAT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Svix/Standard Webhooks does for Codat deliveries."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/codat", content=raw_body, headers=headers)


def event(event_type: str, payload: dict) -> dict:
    return {
        "id": "evt_1",
        "eventType": event_type,
        "generatedDate": "2026-10-21T09:30:00.123Z",
        "payload": payload,
    }


def company_created() -> str:
    return json.dumps(
        event(
            "company.created",
            {"referenceCompany": {"id": "8a210b68-6988-11ed-a1eb-0242ac120002", "name": "Acme Ltd"}},
        )
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("CODAT_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_company_created(self):
        body = company_created()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize(
        "event_type",
        ["connection.created", "connection.connected", "read.completed", "write.successful"],
    )
    def test_other_events(self, event_type):
        body = json.dumps(event(event_type, {"connection": {"id": "conn-1"}, "dataType": "invoices"}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_non_json_content_type_still_verifies(self):
        body = company_created()
        res = post(body, {**signed_headers(body), "content-type": "text/plain"})
        assert res.status_code == 200

    def test_unknown_event_type_acknowledged(self):
        body = json.dumps(event("some.new.event", {}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_multiple_signatures_one_valid(self):
        body = company_created()
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        res = post(body, headers)
        assert res.status_code == 200

    def test_retry_with_same_webhook_id_is_duplicate(self):
        body = company_created()
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = company_created()
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = company_created()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_endpoint_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = company_created()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = company_created()
        headers = signed_headers(body)
        res = post(body.replace("Acme", "Evil"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = company_created()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key(self):
        body = company_created()
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(
                SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
            ).digest()
        ).decode()
        res = post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("CODAT_WEBHOOK_SECRET")
        body = company_created()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
