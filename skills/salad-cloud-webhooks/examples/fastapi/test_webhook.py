# Generated with: salad-cloud-webhooks skill
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

# SaladCloud shows the secret as bare base64 (no "whsec_" prefix). The HMAC key
# is its base64 decoding. The standardwebhooks library also accepts the
# "whsec_" + secret form that Hookdeck needs, and derives the same key.
KEY = b"salad-test-signing-key-0123456789"
SECRET = base64.b64encode(KEY).decode()

os.environ["SALAD_CLOUD_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, resolve_signature_headers  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, key: bytes = KEY) -> str:
    """Sign exactly like SaladCloud does: HMAC-SHA256 over id.timestamp.body."""
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", msg_id=None, timestamp=None, key=KEY, signature=None):
    """Build signature headers. `prefix` is 'webhook' (SaladCloud) or 'svix' (fallback)."""
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, key),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/salad-cloud", content=raw_body, headers=headers)


def job_succeeded(job_id="50150edd-e182-47b5-a754-2d2a04d6ee31"):
    return {
        "type": "queue.job.succeeded",
        "timestamp": "2026-10-05T21:15:34.4256376Z",
        "data": {
            "id": job_id,
            "status": "succeeded",
            "input": {"prompt": "hello"},
            "output": {"text": "Hello!"},
            "events": [
                {"type": "created", "time": "2026-10-05T21:15:32.1180000Z"},
                {"type": "started", "time": "2026-10-05T21:15:33.0120000Z"},
                {"type": "succeeded", "time": "2026-10-05T21:15:34.4010000Z"},
            ],
            "create_time": "2026-10-05T21:15:32.1180000Z",
            "update_time": "2026-10-05T21:15:34.4010000Z",
            "webhook": "https://callback.example.com/result",
            "organization_name": "my-organization",
            "project_name": "my-project",
            "queue_name": "my-queue",
        },
    }


@pytest.fixture(autouse=True)
def restore_secret():
    os.environ["SALAD_CLOUD_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["SALAD_CLOUD_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_accepts_valid_webhook_headers(self):
        raw = json.dumps(job_succeeded())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_svix_headers(self):
        raw = json.dumps(job_succeeded())
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_whsec_prefixed_secret(self):
        os.environ["SALAD_CLOUD_WEBHOOK_SECRET"] = "whsec_" + SECRET
        raw = json.dumps(job_succeeded())
        assert post(raw, signed_headers(raw)).status_code == 200

    def test_prefers_webhook_headers_when_both_sets_present(self):
        raw = json.dumps(job_succeeded())
        headers = signed_headers(raw)
        headers.update({"svix-id": "msg_other", "svix-timestamp": str(now()), "svix-signature": "v1,AAAA"})
        assert post(raw, headers).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{"type":"queue.job.succeeded",  "timestamp":"t",\n"data":{"id":"j1","status":"succeeded"}}'
        headers = signed_headers(raw)
        headers["content-type"] = "text/plain"
        assert post(raw, headers).status_code == 200

    def test_accepts_multiple_signatures_when_one_is_valid(self):
        raw = json.dumps(job_succeeded())
        ts = str(now())
        bad = sign(raw, "msg_multi", ts, b"some-other-secret-value-0123456")
        good = sign(raw, "msg_multi", ts)
        headers = signed_headers(raw, msg_id="msg_multi", timestamp=ts, signature=f"{bad} {good}")
        assert post(raw, headers).status_code == 200

    def test_ignores_non_v1_signature_entries(self):
        raw = json.dumps(job_succeeded())
        ts = str(now())
        v1a = sign(raw, "msg_v1a", ts).replace("v1,", "v1a,")
        headers = signed_headers(raw, msg_id="msg_v1a", timestamp=ts, signature=v1a)
        assert post(raw, headers).status_code == 400

    def test_rejects_tampered_body(self):
        raw = json.dumps(job_succeeded())
        res = post(raw.replace("Hello!", "Hacked"), signed_headers(raw))
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = json.dumps(job_succeeded())
        assert post(raw, signed_headers(raw, key=b"another-secret-key-0123456789ab")).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(job_succeeded())
        assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_too_far_in_future(self):
        raw = json.dumps(job_succeeded())
        assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400

    @pytest.mark.parametrize("name", ["id", "timestamp", "signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(job_succeeded())
        headers = signed_headers(raw)
        del headers[f"webhook-{name}"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature headers"

    def test_rejects_no_signature_headers(self):
        raw = json.dumps(job_succeeded())
        assert post(raw, {"content-type": "application/json"}).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["SALAD_CLOUD_WEBHOOK_SECRET"]
        raw = json.dumps(job_succeeded())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"


class TestEventHandling:
    def test_handles_queue_job_succeeded(self, caplog):
        raw = json.dumps(job_succeeded())
        with caplog.at_level(logging.INFO, logger="salad-cloud-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Job 50150edd-e182-47b5-a754-2d2a04d6ee31 succeeded in queue my-queue" in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        raw = json.dumps({"type": "queue.job.failed", "timestamp": "t", "data": {"id": "j2"}})
        with caplog.at_level(logging.INFO, logger="salad-cloud-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled SaladCloud event type: queue.job.failed" in caplog.text

    def test_acknowledges_repeated_webhook_id_as_duplicate(self):
        raw = json.dumps(job_succeeded("job-dedupe-1"))
        headers = signed_headers(raw, msg_id="msg_dedupe_1")
        assert post(raw, headers).json() == {"received": True}
        retry = post(raw, headers)
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}


class TestResolveSignatureHeaders:
    def test_maps_svix_headers_when_webhook_id_absent(self):
        h = {"svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x"}
        assert resolve_signature_headers(h) == {
            "webhook-id": "a",
            "webhook-timestamp": "1",
            "webhook-signature": "v1,x",
        }

    def test_returns_none_when_a_header_is_missing(self):
        assert resolve_signature_headers({"webhook-id": "a", "webhook-timestamp": "1"}) is None


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
