# Generated with: bird-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Bird secrets look like "whsec_" + base64(key bytes), for example
# "whsec_c+dgRBsFELJ9mR4tu2cyhK0gTMMkqntv". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"bird-test-signing-key-0123456789").decode()

os.environ["BIRD_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like a Standard Webhooks sender (Bird)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None,
                   content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/bird", content=raw_body, headers=headers)


def event(event_type: str, data: dict) -> dict:
    return {"type": event_type, "timestamp": "2026-06-10T14:30:00Z", "data": data}


def email_data(**extra) -> dict:
    return {
        "email_id": "em_01krdgeqcxet5s7t44vh8rt9mg",
        "recipient_id": "er_01krdgeqcxet5s7t44vh8rt9mg",
        "workspace_id": "ws_01krdgeqcxet5s7t44vh8rt9mg",
        "recipient": "user@example.com",
        "recipient_role": "to",
        "tags": [{"name": "category", "value": "welcome"}],
        "metadata": {"order_id": "ord_123"},
        "broadcast_id": None,
        **extra,
    }


def email_delivered() -> str:
    return json.dumps(event("email.delivered", email_data()))


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("BIRD_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_email_delivered(self):
        body = email_delivered()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_email_bounced(self):
        body = json.dumps(
            event(
                "email.bounced",
                email_data(bounce_type="hard", bounce_class="10", bounce_code=550,
                           bounce_description="No such user", sending_ip="192.0.2.1"),
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_whatsapp_received(self):
        body = json.dumps(
            event(
                "whatsapp.received",
                {
                    "direction": "inbound",
                    "from": {"display_name": "Alex Rivera", "phone_number": "+14155550100", "username": "alexr"},
                    "to": {"phone_number": "+13124495569"},
                    "whatsapp_id": "wam_01ky8b3xq4gd7pmzn2ka51f7te",
                    "workspace_id": "ws_01ky7m235keycbnwyajabe1a6b",
                    "metadata": None,
                    "tags": None,
                },
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_preference_granted(self):
        body = json.dumps(
            event(
                "preference.granted",
                {
                    "preference_id": "prf_01krdgeqcxet5s7t44vh8rt9mg",
                    "transition_id": "prt_01krdgeqcxet5s7t44vh8rt9mg",
                    "channel": "sms",
                    "handle": "+15550001234",
                    "sender_scope": None,
                    "topic_id": None,
                    "coverage": "non_transactional",
                    "contact_id": None,
                },
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_unknown_event_type_acknowledged(self):
        body = json.dumps(event("something.new", {}))
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_any_content_type_verifies(self):
        body = email_delivered()
        res = post(body, signed_headers(body, content_type="text/plain"))
        assert res.status_code == 200

    def test_multiple_signatures_one_valid(self):
        body = email_delivered()
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        res = post(body, headers)
        assert res.status_code == 200

    def test_retry_with_same_webhook_id_is_duplicate(self):
        body = email_delivered()
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = email_delivered()
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = email_delivered()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_endpoint_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = email_delivered()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = email_delivered()
        headers = signed_headers(body)
        res = post(body.replace("user@example.com", "evil@example.com"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = email_delivered()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key(self):
        body = email_delivered()
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
        monkeypatch.delenv("BIRD_WEBHOOK_SECRET")
        body = email_delivered()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
