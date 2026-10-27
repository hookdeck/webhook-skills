# Generated with: skovik-webhooks skill
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

# Skovik secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
# example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
# the decoded part.
SECRET = "whsec_" + base64.b64encode(b"skovik-test-signing-key-0123456789").decode()

os.environ["SKOVIK_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, resolve_signature_headers  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Skovik does: HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", msg_id=None, timestamp=None, secret=SECRET, signature=None):
    """Build signature headers. `prefix` is 'webhook' (Skovik) or 'svix' (fallback)."""
    msg_id = msg_id or uuid.uuid4().hex[:24]
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "user-agent": "Skovik-Webhook (+https://developer.skovik.com)",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/skovik", content=raw_body, headers=headers)


def hex24():
    return uuid.uuid4().hex[:24]


def envelope(event_type, related=None, event_id=None):
    """Thin JSON:API-style notification; the related resource is only linked."""
    event_id = event_id or hex24()
    data = {
        "id": event_id,
        "type": "webhook_events",
        "attributes": {"created_at": "2026-05-25T14:30:45Z", "name": event_type},
        "links": {"self": f"/v1/webhook_events/{event_id}"},
    }
    if related:
        rtype, rid = related
        data["relationships"] = {
            "related_object": {
                "data": {"type": rtype, "id": rid},
                "links": {"related": f"/v1/{rtype}/{rid}"},
            }
        }
    return {"id": hex24(), "type": event_type, "timestamp": "2026-05-25T14:30:45Z", "data": data}


def export_completed(event_id=None):
    return envelope("export_orders.completed", ("export_orders", "f3a9c7e15b344a8cb6f122b0"), event_id)


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["SKOVIK_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["SKOVIK_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_accepts_valid_webhook_headers(self):
        raw = json.dumps(export_completed())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_svix_headers(self):
        raw = json.dumps(export_completed())
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_sets_present(self):
        raw = json.dumps(export_completed())
        headers = signed_headers(raw)
        headers.update({"svix-id": "other-id", "svix-timestamp": str(now()), "svix-signature": "v1,AAAA"})
        assert post(raw, headers).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{"id":"d-1",  "type":"misc.ping",\n"timestamp":"2026-05-25T14:30:45Z","data":{"id":"e-1","type":"webhook_events"}}'
        headers = signed_headers(raw)
        headers["content-type"] = "text/plain"
        assert post(raw, headers).status_code == 200

    def test_accepts_multiple_signatures_when_one_is_valid(self):
        raw = json.dumps(export_completed())
        msg_id, ts = "multi-id", str(now())
        other = "whsec_" + base64.b64encode(b"some-other-secret-value-0123456").decode()
        bad = sign(raw, msg_id, ts, other)
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=f"{bad} {sign(raw, msg_id, ts)}")
        assert post(raw, headers).status_code == 200

    def test_ignores_non_v1_signature_entries(self):
        raw = json.dumps(export_completed())
        msg_id, ts = "v1a-id", str(now())
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=sign(raw, msg_id, ts).replace("v1,", "v1a,"))
        assert post(raw, headers).status_code == 400

    def test_rejects_tampered_body(self):
        raw = json.dumps(export_completed())
        headers = signed_headers(raw)
        res = post(raw.replace("x", "Hacked"), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = json.dumps(export_completed())
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-0123456").decode()
        assert post(raw, signed_headers(raw, secret=other)).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(export_completed())
        assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_too_far_in_future(self):
        raw = json.dumps(export_completed())
        assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400

    @pytest.mark.parametrize("name", ["id", "timestamp", "signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(export_completed())
        headers = signed_headers(raw)
        del headers[f"webhook-{name}"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature headers"

    def test_rejects_no_signature_headers(self):
        raw = json.dumps(export_completed())
        assert post(raw, {"content-type": "application/json"}).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["SKOVIK_WEBHOOK_SECRET"]
        raw = json.dumps(export_completed())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"


USER = ("users", "5a1c0de9b7d84f6e8c3a2b10")
EXPORT_ORDER = ("export_orders", "f3a9c7e15b344a8cb6f122b0")
BRANCH = ("branches", "9c2e7f4a1d6b4e0f8a5b3c21")

EVENTS = [
    ("users.created", USER),
    ("users.updated", USER),
    ("users.archived", USER),
    ("export_orders.created", EXPORT_ORDER),
    ("export_orders.completed", EXPORT_ORDER),
    ("export_orders.failed", EXPORT_ORDER),
    ("branches.created", BRANCH),
    ("branches.updated", BRANCH),
    ("branches.archived", BRANCH),
    ("misc.ping", None),
]


class TestEventHandling:
    @pytest.mark.parametrize("event_type,related", EVENTS, ids=[e[0] for e in EVENTS])
    def test_handles_event(self, event_type, related, caplog):
        raw = json.dumps(envelope(event_type, related))
        with caplog.at_level(logging.INFO, logger="skovik-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_logs_the_related_resource(self, caplog):
        raw = json.dumps(export_completed())
        with caplog.at_level(logging.INFO, logger="skovik-webhooks"):
            post(raw, signed_headers(raw))
        assert "Export order completed: export_orders/f3a9c7e15b344a8cb6f122b0" in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        raw = json.dumps(envelope("invoices.created", ("invoices", "i1")))
        with caplog.at_level(logging.INFO, logger="skovik-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Skovik event type: invoices.created" in caplog.text

    def test_acknowledges_retried_event_id_as_duplicate(self):
        raw = json.dumps(export_completed("evt-dedupe-1"))
        first = post(raw, signed_headers(raw))
        assert first.json() == {"received": True}

        retry = post(raw, signed_headers(raw))  # new webhook-id, same data.id
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
