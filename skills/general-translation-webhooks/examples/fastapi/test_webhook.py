# Generated with: general-translation-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
from fastapi.testclient import TestClient

# Secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"gt-test-signing-key-0123456789abcd").decode()

os.environ["GENERAL_TRANSLATION_WEBHOOK_SECRET"] = SECRET

from main import app, processed_event_ids  # noqa: E402

client = TestClient(app)


def sign(raw_body: bytes, msg_id: str, timestamp: str, secret: str = SECRET, version: str = "v1") -> str:
    """Sign exactly like Standard Webhooks: base64(HMAC-SHA256(key, "{id}.{ts}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    return f"{version},{base64.b64encode(digest).decode()}"


def new_id() -> str:
    return "evt_" + uuid.uuid4().hex


def signed_headers(raw_body: bytes, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    msg_id = msg_id or new_id()
    ts = str(int(time.time()) if timestamp is None else timestamp)
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: bytes, headers: dict):
    return client.post("/webhooks/general-translation", content=raw_body, headers=headers)


def envelope(event_type: str, obj: dict, event_id: str = None) -> bytes:
    return json.dumps(
        {
            "id": event_id or new_id(),
            "object": "event",
            "type": event_type,
            "createdAt": "2026-04-30T12:00:00.000Z",
            "apiVersion": "2026-03-06.v1",
            "data": {"object": obj},
        }
    ).encode()


def translated_file(**extra) -> dict:
    return {
        "object": "translated_file",
        "id": "trf_xxx",
        "orgId": "org_xxx",
        "projectId": "project_xxx",
        "branchId": "branch_xxx",
        "sourceFileId": "src_xxx",
        "fileId": "file_xxx",
        "versionId": "ver_xxx",
        "locale": "fr",
        "fileFormat": "JSON",
        "dataFormat": None,
        **extra,
    }


def completed_file() -> bytes:
    return envelope("translated_file.completed", translated_file(completedAt="2026-04-30T12:00:00.000Z"))


@pytest.fixture(autouse=True)
def _env():
    os.environ["GENERAL_TRANSLATION_WEBHOOK_SECRET"] = SECRET
    processed_event_ids.clear()
    yield
    os.environ["GENERAL_TRANSLATION_WEBHOOK_SECRET"] = SECRET


class TestValidDeliveries:
    def test_translated_file_completed(self):
        body = completed_file()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_translated_file_edited(self, caplog):
        body = envelope("translated_file.edited", translated_file(editedAt="2026-04-30T12:05:00.000Z"))
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "edited" in caplog.text

    def test_translation_job_completed(self, caplog):
        body = envelope(
            "translation_job.completed",
            {"object": "translation_job", "jobId": "job_xxx", "completedAt": "2026-04-30T12:00:00.000Z"},
        )
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "job_xxx" in caplog.text

    def test_unknown_event_type_acknowledged(self):
        body = envelope("translation_job.failed", {"object": "translation_job", "jobId": "job_1"})
        assert post(body, signed_headers(body)).status_code == 200

    def test_verifies_raw_bytes_for_any_content_type(self):
        body = completed_file()
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_unusual_whitespace_verified_byte_for_byte(self):
        body = json.dumps(json.loads(completed_file()), indent=4).encode()
        assert post(body, signed_headers(body)).status_code == 200


class TestHeaderPrefixFallback:
    def test_accepts_svix_headers(self):
        body = completed_file()
        assert post(body, signed_headers(body, prefix="svix")).status_code == 200

    def test_rejects_tampered_body_with_svix_headers(self):
        body = completed_file()
        headers = signed_headers(body, prefix="svix")
        assert post(body.replace(b'"fr"', b'"de"'), headers).status_code == 401

    def test_prefers_webhook_headers_when_both_present(self):
        body = completed_file()
        good = signed_headers(body)
        bad = signed_headers(body, prefix="svix", signature="v1,AAAA")
        assert post(body, {**good, **bad}).status_code == 200


class TestSignatureChecks:
    def test_rejects_tampered_body(self):
        body = completed_file()
        assert post(body.replace(b'"fr"', b'"de"'), signed_headers(body)).status_code == 401

    def test_rejects_other_endpoints_secret(self):
        body = completed_file()
        other = "whsec_" + base64.b64encode(b"some-other-endpoint-secret-key!!").decode()
        assert post(body, signed_headers(body, secret=other)).status_code == 401

    def test_rejects_old_timestamp(self):
        body = completed_file()
        assert post(body, signed_headers(body, timestamp=int(time.time()) - 6 * 60)).status_code == 401

    def test_rejects_future_timestamp(self):
        body = completed_file()
        assert post(body, signed_headers(body, timestamp=int(time.time()) + 6 * 60)).status_code == 401

    def test_accepts_when_any_v1_entry_matches(self):
        body = completed_file()
        msg_id, ts = new_id(), str(int(time.time()))
        old = sign(body, msg_id, ts, "whsec_" + base64.b64encode(b"previous-signing-key-0123456789ab").decode())
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"{old} {sign(body, msg_id, ts)}")
        assert post(body, headers).status_code == 200

    def test_ignores_other_signature_versions(self):
        body = completed_file()
        msg_id, ts = new_id(), str(int(time.time()))
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=sign(body, msg_id, ts, SECRET, "v1a"))
        assert post(body, headers).status_code == 401

    def test_rejects_malformed_signature(self):
        body = completed_file()
        assert post(body, signed_headers(body, signature="not-a-signature")).status_code == 401

    def test_rejects_signature_for_different_id(self):
        body = completed_file()
        ts = str(int(time.time()))
        headers = signed_headers(body, msg_id=new_id(), timestamp=ts, signature=sign(body, "evt_other", ts))
        assert post(body, headers).status_code == 401


class TestMissingInput:
    def test_missing_headers_returns_400(self):
        assert post(completed_file(), {"content-type": "application/json"}).status_code == 400

    def test_partial_headers_returns_400(self):
        body = completed_file()
        headers = signed_headers(body)
        del headers["webhook-signature"]
        assert post(body, headers).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["GENERAL_TRANSLATION_WEBHOOK_SECRET"]
        body = completed_file()
        assert post(body, signed_headers(body)).status_code == 500


class TestRetries:
    def test_duplicate_event_id_acknowledged(self):
        body = completed_file()
        first = post(body, signed_headers(body))
        second = post(body, signed_headers(body))
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").status_code == 200
