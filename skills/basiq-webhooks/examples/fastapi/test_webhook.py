# Generated with: basiq-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Basiq secrets look like "whsec_" + base64(key bytes), for example
# "whsec_MA4V6bD7rB0Hcm2aw8ghgDeQ5UAak24DwnX0rX6". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"basiq-test-signing-key-0123456789ab").decode()

os.environ["BASIQ_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly the way Standard Webhooks does for Basiq deliveries."""
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
    return client.post("/webhooks/basiq", content=raw_body, headers=headers)


EVENT_TYPES = [
    "account.updated",
    "connection.activated",
    "connection.created",
    "connection.deleted",
    "connection.invalidated",
    "consent.created",
    "consent.expired",
    "consent.reminder",
    "consent.revoked",
    "consent.updated",
    "consent.warning",
    "transactions.updated",
    "user.created",
    "user.deleted",
    "user.updated",
]


def event(event_type: str) -> str:
    return json.dumps(
        {
            "eventTypeId": event_type,
            "eventId": "evt-123",
            "links": {
                "event": "https://au-api.basiq.io/events/evt-123",
                "eventEntity": "https://au-api.basiq.io/users/usr-456",
            },
        }
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("BASIQ_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    @pytest.mark.parametrize("event_type", EVENT_TYPES)
    def test_documented_events(self, event_type, caplog):
        body = event(event_type)
        with caplog.at_level("INFO", logger="basiq-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert f"{event_type}: https://au-api.basiq.io/users/usr-456" in caplog.text

    def test_non_json_content_type_still_verifies(self):
        body = event("user.created")
        res = post(body, {**signed_headers(body), "content-type": "text/plain"})
        assert res.status_code == 200

    def test_unknown_event_type_acknowledged(self, caplog):
        body = event("some.new.event")
        with caplog.at_level("INFO", logger="basiq-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Basiq event type: some.new.event" in caplog.text

    def test_multiple_signatures_one_valid(self):
        body = event("user.created")
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        res = post(body, headers)
        assert res.status_code == 200

    def test_repeat_with_same_webhook_id_is_duplicate(self):
        body = event("user.created")
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = event("user.created")
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = event("user.created")
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_endpoint_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = event("user.created")
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = event("user.created")
        headers = signed_headers(body)
        res = post(body.replace("usr-456", "usr-999"), headers)
        assert res.status_code == 400

    def test_reserialised_body(self):
        body = event("user.created")
        headers = signed_headers(body)
        res = post(json.dumps(json.loads(body), indent=2), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = event("user.created")
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key(self):
        body = event("user.created")
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
        monkeypatch.delenv("BASIQ_WEBHOOK_SECRET")
        body = event("user.created")
        res = post(body, signed_headers(body))
        assert res.status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
