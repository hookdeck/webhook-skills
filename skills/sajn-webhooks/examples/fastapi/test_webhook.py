# Generated with: sajn-webhooks skill
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

# sajn secrets look like "whsec_" + base64(key bytes). The HMAC key is the
# decoded part. This is the secret sajn's own test-request script uses.
SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"

os.environ["SAJN_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, processed_event_ids  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like sajn does: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    """Headers for a delivery. `prefix` is "webhook" (sajn) or "svix" (fallback)."""
    msg_id = msg_id or f"cm{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/sajn", content=raw_body, headers=headers)


def event(event_type, data, event_id=None):
    return {
        "id": event_id or f"cm{uuid.uuid4().hex}",
        "type": event_type,
        "createdAt": "2026-10-01T09:30:00.000Z",
        "apiVersion": "2026-10",
        "workspaceId": "cm4k2x9p10001abcd1234efgh",
        "environment": "PRODUCTION",
        "actor": None,
        "data": data,
    }


def document_completed():
    return event(
        "document.completed",
        {
            "object": {
                "id": "cm4k2x9p10003abcd1234efgh",
                "name": "Anställningsavtal – Kai Lindqvist",
                "status": "COMPLETED",
                "completedAt": "2026-10-01T09:30:00.000Z",
            }
        },
    )


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SAJN_WEBHOOK_SECRET", SECRET)
    processed_event_ids.clear()


class TestValidSignatures:
    def test_document_completed(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(document_completed())
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Document completed" in caplog.text

    def test_document_fully_signed(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(event("document.fully_signed", {"object": {"id": "cm4k2x9p10003abcd1234efgh"}}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "fully signed" in caplog.text

    def test_document_party_signed(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(
            event(
                "document.party.signed",
                {"object": {"id": "cm4k2x9p10003abcd1234efgh"}, "party": {"id": "cm4k2x9p10004abcd1234efgh"}},
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Party cm4k2x9p10004abcd1234efgh signed" in caplog.text

    def test_document_party_delivery_failed(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(
            event(
                "document.party.delivery_failed",
                {"object": {"id": "cm4k2x9p10003abcd1234efgh"}, "party": {"id": "cm4k2x9p10004abcd1234efgh"}},
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Invitation to party" in caplog.text

    def test_identity_check_failed(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(event("identity_check.failed", {"object": {"id": "ic_1"}, "failureReason": "EXPIRED"}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "EXPIRED" in caplog.text

    def test_webhook_test(self):
        body = json.dumps(
            event("webhook.test", {"object": {"id": "cm4k2x9p10013abcd1234efgh", "url": "https://example.com/webhooks/sajn"}})
        )
        assert post(body, signed_headers(body)).status_code == 200

    def test_unknown_event_type_is_acknowledged(self):
        body = json.dumps(event("document.something_new", {"object": {}}))
        assert post(body, signed_headers(body)).status_code == 200

    def test_any_content_type(self):
        body = json.dumps(document_completed())
        headers = {**signed_headers(body), "content-type": "application/cloudevents+json"}
        assert post(body, headers).status_code == 200

    def test_any_one_of_several_signatures_matches(self):
        body = json.dumps(document_completed())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_other_signature_versions_are_ignored(self):
        body = json.dumps(document_completed())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1a,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_retried_delivery_is_skipped(self):
        evt = document_completed()
        body = json.dumps(evt)
        first = post(body, signed_headers(body))
        # A retry carries the same id and body but a new timestamp and signature.
        second = post(body, signed_headers(body, msg_id=evt["id"], timestamp=now() + 1))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestSvixHeaderFallback:
    def test_svix_headers_are_accepted(self):
        body = json.dumps(document_completed())
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(document_completed())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(document_completed())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(document_completed())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_unsigned_dashboard_save_check_gets_json_400(self):
        res = post('{"test":true}', {"content-type": "application/json", "user-agent": "sajn-webhook-validator/1.0"})
        assert res.status_code == 400
        assert res.headers["content-type"].startswith("application/json")

    def test_2026_09_endpoint_gets_api_version_hint(self):
        body = json.dumps({"event": "DOCUMENT_COMPLETED", "payload": {}, "apiVersion": "2026-09"})
        res = post(body, {"content-type": "application/json", "x-sajn-signature": "abc"})
        assert res.status_code == 400
        assert "API version 2026-10" in res.json()["detail"]

    def test_bad_signature(self):
        body = json.dumps(document_completed())
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_other_endpoints_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = json.dumps(document_completed())
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_tampered_body(self):
        body = json.dumps(document_completed())
        headers = signed_headers(body)
        assert post(body.replace("COMPLETED", "DRAFT"), headers).status_code == 400

    def test_timestamp_outside_tolerance(self):
        body = json.dumps(document_completed())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_signature_keyed_with_undecoded_secret(self):
        body = json.dumps(document_completed())
        msg_id, ts = "cm_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}")
        assert post(body, headers).status_code == 400


class TestFailClosed:
    def test_secret_not_set(self, monkeypatch):
        monkeypatch.delenv("SAJN_WEBHOOK_SECRET", raising=False)
        body = json.dumps(document_completed())
        assert post(body, signed_headers(body)).status_code == 500
