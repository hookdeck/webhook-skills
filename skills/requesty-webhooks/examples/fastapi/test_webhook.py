# Generated with: requesty-webhooks skill
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

# Requesty secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
# example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
# the decoded part.
SECRET = "whsec_" + base64.b64encode(b"requesty-test-signing-key-0123456789a").decode()

os.environ["REQUESTY_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, resolve_signature_headers  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Requesty does: HMAC-SHA256 over id.timestamp.body."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, prefix="webhook", event="org.balance.below_absolute", msg_id=None, timestamp=None, secret=SECRET, signature=None):
    """Build signature headers. `prefix` is 'webhook' (Requesty) or 'svix' (fallback)."""
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        **({"x-requesty-event": event} if event else {}),
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/requesty", content=raw_body, headers=headers)


def alert(event_type, data, alert_id=None):
    return {"id": alert_id or str(uuid.uuid4()), "type": event_type, "data": data}


def org_balance(alert_id=None):
    return alert(
        "org.balance.below_absolute",
        {"org_id": "org_abc123", "balance_threshold": "100", "current_balance": "87.50"},
        alert_id,
    )


def sample_request():
    return {
        "request_id": "req_123",
        "request": {"model": "openai/gpt-4o", "messages": [{"role": "user", "content": "hello"}]},
        "response": {
            "id": "chatcmpl_1",
            "object": "chat.completion",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "Hi!"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 15, "total_tokens": 25, "cost": 0},
        },
    }


@pytest.fixture(autouse=True)
def secret_env():
    os.environ["REQUESTY_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["REQUESTY_WEBHOOK_SECRET"] = SECRET


class TestSignatureVerification:
    def test_accepts_valid_webhook_headers(self):
        raw = json.dumps(org_balance())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_svix_headers(self):
        raw = json.dumps(org_balance())
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_sets_present(self):
        raw = json.dumps(org_balance())
        headers = signed_headers(raw)
        headers.update({"svix-id": "msg_other", "svix-timestamp": str(now()), "svix-signature": "v1,AAAA"})
        assert post(raw, headers).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = '{"id":"a-1",  "type":"org.balance.below_absolute",\n"data":{"org_id":"o1","current_balance":"1"}}'
        headers = signed_headers(raw)
        headers["content-type"] = "text/plain"
        assert post(raw, headers).status_code == 200

    def test_accepts_multiple_signatures_when_one_is_valid(self):
        raw = json.dumps(org_balance())
        msg_id, ts = "msg_multi", str(now())
        other = "whsec_" + base64.b64encode(b"some-other-secret-value-0123456").decode()
        bad = sign(raw, msg_id, ts, other)
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=f"{bad} {sign(raw, msg_id, ts)}")
        assert post(raw, headers).status_code == 200

    def test_ignores_non_v1_signature_entries(self):
        raw = json.dumps(org_balance())
        msg_id, ts = "msg_v1a", str(now())
        headers = signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=sign(raw, msg_id, ts).replace("v1,", "v1a,"))
        assert post(raw, headers).status_code == 400

    def test_rejects_tampered_body(self):
        raw = json.dumps(org_balance())
        headers = signed_headers(raw)
        res = post(raw.replace("87.50", "1.00"), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_signature_from_another_secret(self):
        raw = json.dumps(org_balance())
        other = "whsec_" + base64.b64encode(b"another-organisation-secret-01").decode()
        assert post(raw, signed_headers(raw, secret=other)).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(org_balance())
        assert post(raw, signed_headers(raw, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_too_far_in_future(self):
        raw = json.dumps(org_balance())
        assert post(raw, signed_headers(raw, timestamp=now() + 6 * 60)).status_code == 400

    @pytest.mark.parametrize("name", ["id", "timestamp", "signature"])
    def test_rejects_missing_header(self, name):
        raw = json.dumps(org_balance())
        headers = signed_headers(raw)
        del headers[f"webhook-{name}"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing signature headers"

    def test_rejects_no_signature_headers(self):
        raw = json.dumps(org_balance())
        assert post(raw, {"content-type": "application/json"}).status_code == 400

    def test_fails_closed_without_secret(self):
        del os.environ["REQUESTY_WEBHOOK_SECRET"]
        raw = json.dumps(org_balance())
        res = post(raw, signed_headers(raw))
        assert res.status_code == 500
        assert res.json()["detail"] == "Webhook secret not configured"


ALERTS = [
    ("user.budget.exceeded_percent", {"user_id": "u1", "user_email": "alice@company.com", "limit": "100", "spend": "82.40", "percentage_exceeded": "0.8"}),
    ("user.budget.exceeded_absolute", {"user_id": "u1", "user_email": "alice@company.com", "spend": "50.35", "absolute_exceeded": "50"}),
    ("group.budget.exceeded_percent", {"group_id": "g1", "group_name": "Engineering", "group_admins": [{"email": "admin@company.com"}], "limit": "500", "spend": "452.10", "percentage_exceeded": "0.9"}),
    ("org.balance.below_absolute", {"org_id": "org_abc123", "balance_threshold": "100", "current_balance": "87.50"}),
    ("apikey.budget.exceeded_percent", {"api_key_id": "k1", "api_key_name": "production-key", "limit": "100", "spend": "82.40", "percentage_exceeded": "0.8"}),
    ("apikey.budget.exceeded_absolute", {"api_key_id": "k1", "api_key_name": "production-key", "spend": "50.35", "absolute_exceeded": "50"}),
]


class TestEventHandling:
    @pytest.mark.parametrize("event_type,data", ALERTS, ids=[e[0] for e in ALERTS])
    def test_handles_alert(self, event_type, data, caplog):
        raw = json.dumps(alert(event_type, data))
        with caplog.at_level(logging.INFO, logger="requesty-webhooks"):
            res = post(raw, signed_headers(raw, event=event_type))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_handles_sample_request_which_has_no_type_in_body(self, caplog):
        raw = json.dumps(sample_request())
        with caplog.at_level(logging.INFO, logger="requesty-webhooks"):
            res = post(raw, signed_headers(raw, msg_id="req_123", event="sample.request"))
        assert res.status_code == 200
        assert "Sampled request req_123 (model openai/gpt-4o, tokens 25)" in caplog.text

    def test_falls_back_to_body_type_without_event_header(self, caplog):
        raw = json.dumps(org_balance())
        with caplog.at_level(logging.INFO, logger="requesty-webhooks"):
            res = post(raw, signed_headers(raw, event=None))
        assert res.status_code == 200
        assert "balance $87.50 is below $100" in caplog.text

    def test_acknowledges_unhandled_event_types(self, caplog):
        raw = json.dumps(alert("org.something.new", {}))
        with caplog.at_level(logging.INFO, logger="requesty-webhooks"):
            res = post(raw, signed_headers(raw, event="org.something.new"))
        assert res.status_code == 200
        assert "Unhandled Requesty event type: org.something.new" in caplog.text

    def test_acknowledges_retry_as_duplicate(self):
        raw = json.dumps(org_balance("alert-dedupe-1"))
        first = post(raw, signed_headers(raw, msg_id="alert-dedupe-1"))
        assert first.json() == {"received": True}

        # Same webhook-id, new timestamp and signature, as Requesty sends on retry.
        retry = post(raw, signed_headers(raw, msg_id="alert-dedupe-1", timestamp=now() + 30))
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
