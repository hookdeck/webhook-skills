# Generated with: epilot-webhooks skill
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

# epilot secrets look like "whsec_" + base64(key bytes), for example
# "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"epilot-test-signing-key-0123456").decode()

os.environ["EPILOT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

# epilot sends the Ed25519 entry first: "v1a,<asymmetric> v1,<symmetric>".
V1A = "v1a," + base64.b64encode(os.urandom(64)).decode()


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """The v1 (symmetric HMAC-SHA256) entry, exactly as epilot signs it."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or f"{V1A} {sign(raw_body, msg_id, ts, secret)}",
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/epilot", content=raw_body, headers=headers)


def automation_trigger() -> dict:
    return {
        "metadata": {
            "webhook_id": "wh_123",
            "organization_id": "739224",
            "event_type": "automation_trigger_webhook",
            "correlation_id": "c0ffee",
        },
        "entity": {"_id": "e1", "_schema_": "opportunity", "name": "New Opportunity", "status": "open"},
        "relations": [],
        "changed_attributes": {"added": {}, "deleted": {}, "updated": {}},
    }


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("EPILOT_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_accepts_automation_trigger_with_v1a_and_v1(self, caplog):
        body = json.dumps(automation_trigger())
        with caplog.at_level(logging.INFO, logger="epilot-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Automation trigger: opportunity e1" in caplog.text

    def test_accepts_customer_request_created(self, caplog):
        payload = automation_trigger()
        payload["metadata"]["event_type"] = "customer_request_created"
        body = json.dumps(payload)
        with caplog.at_level(logging.INFO, logger="epilot-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Customer request created" in caplog.text

    def test_accepts_file_created_event_catalog_payload(self, caplog):
        body = json.dumps(
            {
                "_event_name": "FileCreated",
                "_org_id": "739224",
                "event_attachments": [{"entity_id": "f1", "filename": "invoice.pdf", "version_index": 0}],
            }
        )
        with caplog.at_level(logging.INFO, logger="epilot-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "invoice.pdf" in caplog.text

    def test_acknowledges_unknown_event_names(self, caplog):
        payload = automation_trigger()
        payload["metadata"]["event_type"] = "event_SomethingNew"
        body = json.dumps(payload)
        with caplog.at_level(logging.INFO, logger="epilot-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled epilot event" in caplog.text

    def test_accepts_v1_only_signature_header(self):
        body = json.dumps(automation_trigger())
        ts = str(now())
        res = post(body, signed_headers(body, msg_id="msg_v1only", timestamp=ts, signature=sign(body, "msg_v1only", ts)))
        assert res.status_code == 200

    def test_accepts_any_of_several_v1_entries(self):
        body = json.dumps(automation_trigger())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_verifies_any_content_type(self):
        body = json.dumps(automation_trigger())
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_accepts_svix_prefixed_headers(self):
        body = json.dumps(automation_trigger())
        assert post(body, signed_headers(body, prefix="svix")).status_code == 200

    def test_prefers_webhook_headers_when_both_sets_present(self):
        body = json.dumps(automation_trigger())
        headers = {
            **signed_headers(body),
            "svix-id": "msg_other",
            "svix-timestamp": str(now()),
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200

    def test_duplicate_webhook_id_returns_200(self):
        body = json.dumps(automation_trigger())
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers_rejected(self):
        body = json.dumps(automation_trigger())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_v1_signature_rejected(self):
        body = json.dumps(automation_trigger())
        res = post(body, signed_headers(body, signature=f"{V1A} v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_v1a_only_rejected(self):
        body = json.dumps(automation_trigger())
        assert post(body, signed_headers(body, signature=V1A)).status_code == 400

    def test_malformed_signature_entry_rejected(self):
        body = json.dumps(automation_trigger())
        assert post(body, signed_headers(body, signature="not-a-signature")).status_code == 400

    def test_other_webhooks_secret_rejected(self):
        other = "whsec_" + base64.b64encode(b"another-webhook-secret-012345678").decode()
        body = json.dumps(automation_trigger())
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_tampered_body_rejected(self):
        body = json.dumps(automation_trigger())
        headers = signed_headers(body)
        assert post(body.replace("open", "won"), headers).status_code == 400

    def test_old_timestamp_rejected(self):
        body = json.dumps(automation_trigger())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_undecoded_secret_key_rejected(self):
        body = json.dumps(automation_trigger())
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        res = post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestMethods:
    OTHER_SECRET = "whsec_" + base64.b64encode(b"another-webhook-key").decode()

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_other_methods(self, method):
        body = json.dumps(automation_trigger())
        ok = client.request(method, "/webhooks/epilot", content=body, headers=signed_headers(body))
        assert ok.status_code == 200
        bad = client.request(
            method, "/webhooks/epilot", content=body, headers=signed_headers(body, secret=self.OTHER_SECRET)
        )
        assert bad.status_code == 400

    def test_get_without_body_verified_over_zero_bytes(self):
        assert client.get("/webhooks/epilot", headers=signed_headers("")).status_code == 200
        assert client.get("/webhooks/epilot", headers=signed_headers("x")).status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("EPILOT_WEBHOOK_SECRET")
        body = json.dumps(automation_trigger())
        assert post(body, signed_headers(body)).status_code == 500
