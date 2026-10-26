# Generated with: airweave-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
# base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"airweave-test-signing-key-012345").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"some-other-webhook-signing-key00").decode()

os.environ["AIRWEAVE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Airweave (Svix)."""
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
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/airweave", content=raw_body, headers=headers)


SYNC_BASE = {
    "sync_id": "440e8400-e29b-41d4-a716-446655440099",
    "sync_job_id": "550e8400-e29b-41d4-a716-446655440000",
    "collection_id": "770e8400-e29b-41d4-a716-446655440002",
    "collection_readable_id": "finance-data-ab123",
    "collection_name": "Finance Data",
    "source_connection_id": "660e8400-e29b-41d4-a716-446655440001",
    "source_type": "notion",
    "timestamp": "2025-01-15T14:00:00Z",
}
CONNECTION_BASE = {
    "source_connection_id": "660e8400-e29b-41d4-a716-446655440001",
    "collection_readable_id": "finance-data-ab123",
    "source_type": "notion",
    "is_authenticated": True,
    "timestamp": "2025-01-15T13:55:00Z",
}
COLLECTION_BASE = {
    "collection_id": "770e8400-e29b-41d4-a716-446655440002",
    "collection_name": "Finance Data",
    "collection_readable_id": "finance-data-ab123",
    "timestamp": "2025-01-15T13:50:00Z",
}

PAYLOADS = {
    "sync.pending": SYNC_BASE,
    "sync.running": SYNC_BASE,
    "sync.completed": {
        **SYNC_BASE,
        "entities_inserted": 42,
        "entities_updated": 10,
        "entities_deleted": 3,
        "entities_skipped": 120,
        "chunks_written": 215,
    },
    "sync.failed": {**SYNC_BASE, "error": "Authentication token expired"},
    "sync.cancelled": SYNC_BASE,
    "source_connection.created": {**CONNECTION_BASE, "is_authenticated": False},
    "source_connection.auth_completed": CONNECTION_BASE,
    "source_connection.deleted": {**CONNECTION_BASE, "is_authenticated": False},
    "collection.created": COLLECTION_BASE,
    "collection.updated": COLLECTION_BASE,
    "collection.deleted": COLLECTION_BASE,
}


def body(event_type: str, **extra) -> str:
    return json.dumps({"event_type": event_type, **PAYLOADS[event_type], **extra})


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("AIRWEAVE_WEBHOOK_SECRET", SECRET)


class TestValidDeliveries:
    @pytest.mark.parametrize("event_type", list(PAYLOADS))
    def test_accepts_event(self, event_type, caplog):
        caplog.set_level("INFO")
        raw = body(event_type)
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Airweave webhook" not in caplog.text  # no verification failure logged
        assert "Unhandled" not in caplog.text

    def test_logs_sync_completed_metrics(self, caplog):
        caplog.set_level("INFO")
        raw = body("sync.completed")
        post(raw, signed_headers(raw))
        assert "Finance Data (42 inserted, 10 updated, 3 deleted, 215 chunks)" in caplog.text

    def test_acknowledges_unknown_event_types(self, caplog):
        caplog.set_level("INFO")
        raw = json.dumps({"event_type": "sync.future_thing", "timestamp": "2025-01-15T14:00:00Z"})
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Airweave event type: sync.future_thing" in caplog.text

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{ "event_type":"collection.created",  "collection_name":"Spacing   matters" }'
        res = post(raw, signed_headers(raw, content_type="text/plain"))
        assert res.status_code == 200

    def test_accepts_when_any_of_several_v1_signatures_matches(self):
        raw = body("sync.completed")
        msg_id, ts = "msg_multi", str(now())
        signature = f"{sign(raw, msg_id, ts, OTHER_SECRET)} {sign(raw, msg_id, ts)}"
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=signature))
        assert res.status_code == 200

    def test_ignores_non_v1_signature_versions(self):
        raw = body("sync.completed")
        msg_id, ts = "msg_v1a", str(now())
        signature = sign(raw, msg_id, ts).replace("v1,", "v1a,")
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=signature))
        assert res.status_code == 400


class TestInvalidDeliveries:
    def test_rejects_tampered_body(self):
        headers = signed_headers(body("sync.completed"))
        res = post(body("sync.completed", entities_inserted=9999), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = body("sync.failed")
        res = post(raw, signed_headers(raw, secret=OTHER_SECRET))
        assert res.status_code == 400

    def test_rejects_malformed_signature(self):
        raw = body("sync.failed")
        res = post(raw, signed_headers(raw, signature="v1,not-a-signature"))
        assert res.status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = body("sync.completed")
        res = post(raw, signed_headers(raw, timestamp=now() - 6 * 60))
        assert res.status_code == 400

    def test_rejects_future_timestamp(self):
        raw = body("sync.completed")
        res = post(raw, signed_headers(raw, timestamp=now() + 6 * 60))
        assert res.status_code == 400

    @pytest.mark.parametrize("name", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_rejects_missing_header(self, name):
        raw = body("sync.completed")
        headers = signed_headers(raw)
        del headers[name]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing Svix signature headers"

    def test_rejects_correctly_signed_non_json_body(self):
        raw = "not json"
        res = post(raw, signed_headers(raw))
        assert res.status_code == 400


class TestIdempotency:
    def test_acknowledges_retried_svix_id_without_reprocessing(self):
        raw = body("sync.completed")
        headers = signed_headers(raw, msg_id="msg_dupe_1")
        assert post(raw, headers).json() == {"received": True}

        second = post(raw, headers)
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestConfiguration:
    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("AIRWEAVE_WEBHOOK_SECRET")
        raw = body("sync.completed")
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"

    def test_health(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
