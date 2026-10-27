# Generated with: basiq-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import uuid

import pytest

# Basiq secrets look like "whsec_" + base64(key bytes), for example
# "whsec_MA4V6bD7rB0Hcm2aw8ghgDeQ5UAak24DwnX0rX6". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"basiq-test-signing-key-0123456789").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"another-subscriptions-signing-key").decode()

os.environ["BASIQ_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, processed_message_ids  # noqa: E402

client = TestClient(app)

DOCUMENTED_EVENTS = [
    "user.created", "user.updated", "user.deleted",
    "connection.created", "connection.activated", "connection.invalidated", "connection.deleted",
    "consent.created", "consent.updated", "consent.revoked", "consent.expired",
    "consent.reminder", "consent.warning",
    "account.updated", "transactions.updated",
]


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Basiq does: v1,base64(HMAC-SHA256(key, id.timestamp.body))."""
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
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/basiq", content=raw_body, headers=headers)


def notification(event_type: str, entity_path: str = "users/88a85f64-5717-4562-b3fc-2c963f66af88") -> dict:
    event_id = secrets.token_hex(32)
    return {
        "eventTypeId": event_type,
        "eventId": event_id,
        "links": {
            "event": f"https://au-api.basiq.io/events/{event_id}",
            "eventEntity": f"https://au-api.basiq.io/{entity_path}",
        },
    }


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("BASIQ_WEBHOOK_SECRET", SECRET)
    processed_message_ids.clear()


class TestValidSignatures:
    @pytest.mark.parametrize("event_type", DOCUMENTED_EVENTS)
    def test_accepts_and_handles_documented_events(self, event_type, caplog):
        body = json.dumps(notification(event_type))
        with caplog.at_level(logging.INFO, logger="basiq-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_logs_unknown_event_types_as_unhandled(self, caplog):
        body = json.dumps(notification("something.new"))
        with caplog.at_level(logging.INFO, logger="basiq-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Basiq event type: something.new" in caplog.text

    def test_verifies_raw_bytes_with_odd_whitespace(self):
        body = json.dumps(notification("user.created"), indent=4)
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_any_content_type(self):
        body = json.dumps(notification("user.created"))
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_accepts_when_one_of_several_signatures_matches(self):
        body = json.dumps(notification("consent.revoked", "consents/abc"))
        headers = signed_headers(body)
        other = sign(body, "other-id", headers["webhook-timestamp"])
        headers["webhook-signature"] = f"{other} {headers['webhook-signature']}"
        assert post(body, headers).status_code == 200

    def test_ignores_signature_versions_other_than_v1(self):
        body = json.dumps(notification("user.created"))
        headers = signed_headers(body)
        headers["webhook-signature"] = f"v1a,{headers['webhook-signature'][3:]} {headers['webhook-signature']}"
        assert post(body, headers).status_code == 200

    def test_falls_back_to_svix_headers_when_webhook_id_absent(self):
        body = json.dumps(notification("account.updated", "users/u1/accounts/a1"))
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_prefers_webhook_headers_when_both_present(self):
        body = json.dumps(notification("user.created"))
        headers = signed_headers(body)
        headers.update({"svix-id": "other", "svix-timestamp": headers["webhook-timestamp"], "svix-signature": "v1,AAAA"})
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_rejects_tampered_body(self):
        body = json.dumps(notification("user.created"))
        headers = signed_headers(body)
        res = post(body.replace("user.created", "user.deleted"), headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_another_subscriptions_secret(self):
        body = json.dumps(notification("user.created"))
        assert post(body, signed_headers(body, secret=OTHER_SECRET)).status_code == 400

    def test_rejects_timestamp_more_than_5_minutes_old(self):
        body = json.dumps(notification("user.created"))
        assert post(body, signed_headers(body, timestamp=now() - 6 * 60)).status_code == 400

    def test_rejects_timestamp_more_than_5_minutes_in_future(self):
        body = json.dumps(notification("user.created"))
        assert post(body, signed_headers(body, timestamp=now() + 6 * 60)).status_code == 400

    def test_rejects_malformed_signature(self):
        body = json.dumps(notification("user.created"))
        assert post(body, signed_headers(body, signature="not-a-signature")).status_code == 400

    def test_rejects_non_numeric_timestamp(self):
        body = json.dumps(notification("user.created"))
        headers = signed_headers(body, timestamp="yesterday", signature="v1,AAAA")
        assert post(body, headers).status_code == 400

    @pytest.mark.parametrize("missing", ["webhook-id", "webhook-timestamp", "webhook-signature"])
    def test_rejects_missing_header(self, missing):
        body = json.dumps(notification("user.created"))
        headers = signed_headers(body)
        del headers[missing]
        assert post(body, headers).status_code == 400

    def test_rejects_validly_signed_body_that_is_not_json(self):
        body = "not json"
        res = post(body, signed_headers(body))
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"


class TestFailClosed:
    def test_returns_500_when_secret_is_unset(self, monkeypatch, caplog):
        monkeypatch.delenv("BASIQ_WEBHOOK_SECRET")
        body = json.dumps(notification("user.created"))
        with caplog.at_level(logging.INFO, logger="basiq-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 500
        assert "user.created" not in caplog.text


class TestResentMessages:
    def test_acknowledges_repeated_webhook_id_without_handling_twice(self, caplog):
        body = json.dumps(notification("transactions.updated", "users/u1/transactions"))
        headers = signed_headers(body, msg_id="msg_resend_1")
        assert post(body, headers).json() == {"received": True}
        with caplog.at_level(logging.INFO, logger="basiq-webhooks"):
            second = post(body, headers)
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
        assert "Transactions updated" not in caplog.text


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
