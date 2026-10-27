# Generated with: velt-webhooks skill
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

# Velt secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
# example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
# the decoded part.
SECRET = "whsec_" + base64.b64encode(b"velt-test-signing-key-0123456789").decode()

os.environ["VELT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, resolve_signature_headers  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Velt does: HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", msg_id=None, timestamp=None, secret=SECRET, signature=None):
    """Build signature headers. `prefix` is 'webhook' (Velt) or 'svix' (fallback)."""
    msg_id = msg_id or uuid.uuid4().hex[:24]
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "user-agent": "Svix-Webhooks/1.0",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/velt", content=raw_body, headers=headers)


def hex24():
    return uuid.uuid4().hex[:24]


def payload_for(event, **extra):
    """Advanced (V2) payload: {actionType, data, event, platform, source, webhookId}."""
    data = {
        "actionUser": {"userId": "user123", "name": "Actor User", "organizationId": "org123"},
        "commentAnnotation": {"annotationId": "anno-xyz", "comments": []},
        "metadata": {
            "apiKey": "VKabul7W2DJhLu1BiMaj",
            "document": {"documentId": "doc-1", "documentName": "Doc One"},
            "organization": {"organizationId": "org123"},
        },
    }
    data.update(extra)
    return {
        "actionType": "add",
        "data": data,
        "event": event,
        "platform": "sdk",
        "source": event.split(".")[0].replace("_annotation", ""),
        "webhookId": "dummyWebhookId",
    }


def comment_add():
    return payload_for("comment.add")


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["VELT_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["VELT_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_accepts_valid_webhook_headers(self):
        raw = json.dumps(comment_add())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_svix_headers(self):
        raw = json.dumps(comment_add())
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_sets_present(self):
        raw = json.dumps(comment_add())
        headers = signed_headers(raw)
        headers.update({"svix-id": "other-id", "svix-timestamp": str(now()), "svix-signature": "v1,AAAA"})
        assert post(raw, headers).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{"event":  "huddle.join",\n"data":{"metadata":{"document":{"documentId":"doc-1"}}}}'
        headers = signed_headers(raw)
        headers["content-type"] = "text/plain"
        assert post(raw, headers).status_code == 200

    def test_accepts_multiple_signatures_when_one_is_valid(self):
        raw = json.dumps(comment_add())
        msg_id, ts = "multi-id", str(now())
        other = "whsec_" + base64.b64encode(b"some-other-secret-value-0123456").decode()
        bad = sign(raw, msg_id, ts, other)
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=f"{bad} {sign(raw, msg_id, ts)}")
        assert post(raw, headers).status_code == 200

    def test_ignores_non_v1_signature_entries(self):
        raw = json.dumps(comment_add())
        msg_id, ts = "v1a-id", str(now())
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=sign(raw, msg_id, ts).replace("v1,", "v1a,"))
        assert post(raw, headers).status_code == 400

    def test_rejects_tampered_body(self):
        raw = json.dumps(comment_add())
        headers = signed_headers(raw)
        res = post(raw.replace("x", "Hacked"), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = json.dumps(comment_add())
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-0123456").decode()
        assert post(raw, signed_headers(raw, secret=other)).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(comment_add())
        assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_too_far_in_future(self):
        raw = json.dumps(comment_add())
        assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400

    @pytest.mark.parametrize("name", ["id", "timestamp", "signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(comment_add())
        headers = signed_headers(raw)
        del headers[f"webhook-{name}"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature headers"

    def test_rejects_no_signature_headers(self):
        raw = json.dumps(comment_add())
        assert post(raw, {"content-type": "application/json"}).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["VELT_WEBHOOK_SECRET"]
        raw = json.dumps(comment_add())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"


EVENTS = [
    "comment_annotation.add",
    "comment_annotation.assign",
    "comment_annotation.status_change",
    "comment_annotation.priority_change",
    "comment_annotation.custom_list_change",
    "comment_annotation.subscribe",
    "comment_annotation.unsubscribe",
    "comment_annotation.accept",
    "comment_annotation.reject",
    "comment_annotation.approve",
    "comment_annotation.suggestion_accept",
    "comment_annotation.suggestion_reject",
    "comment.add",
    "comment.update",
    "comment.delete",
    "comment.reaction_add",
    "comment.reaction_delete",
    "huddle.create",
    "huddle.join",
    "crdt.update_data",
    "recorder.done",
    "execution.dispatched",
    "execution.completed",
    "execution.failed",
    "execution.cancelled",
    "step.awaiting-approval",
    "step.completed",
    "step.failed",
    "step.breached",
    "step.cancelled",
    "group.quorum-met",
    "loop.iteration-started",
    "loop.exhausted",
]


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, caplog):
        raw = json.dumps(payload_for(event))
        with caplog.at_level(logging.INFO, logger="velt-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_logs_annotation_and_document_of_a_comment_event(self, caplog):
        raw = json.dumps(comment_add())
        with caplog.at_level(logging.INFO, logger="velt-webhooks"):
            post(raw, signed_headers(raw))
        assert "comment.add: anno-xyz in doc-1" in caplog.text

    def test_logs_the_crdt_document(self, caplog):
        payload = payload_for("crdt.update_data", crdtData={"id": "crdt-todos-1", "data": []})
        del payload["data"]["commentAnnotation"]
        raw = json.dumps(payload)
        with caplog.at_level(logging.INFO, logger="velt-webhooks"):
            post(raw, signed_headers(raw))
        assert "CRDT data updated: crdt-todos-1 in doc-1" in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        raw = json.dumps(payload_for("invoice.created"))
        with caplog.at_level(logging.INFO, logger="velt-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Velt event type: invoice.created" in caplog.text

    def test_acknowledges_verified_encrypted_payload_without_event(self, caplog):
        raw = json.dumps({"encryptedData": "AAAA", "encryptedKey": "BBBB", "iv": "CCCC"})
        with caplog.at_level(logging.INFO, logger="velt-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Velt event type: None" in caplog.text

    def test_acknowledges_retry_of_same_webhook_id_as_duplicate(self):
        raw = json.dumps(comment_add())
        msg_id = "msg_dedupe_1"
        first = post(raw, signed_headers(raw, msg_id=msg_id))
        assert first.json() == {"received": True}

        retry = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=now() + 1))
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
