# Generated with: browserbase-webhooks skill
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

# Browserbase secrets are "whsec_" + base64(key bytes).
# The HMAC key is the base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"browserbase-test-signing-key-012").decode()
PREVIOUS_SECRET = "whsec_" + base64.b64encode(b"browserbase-previous-signing-key").decode()

os.environ["BROWSERBASE_WEBHOOK_SECRET"] = SECRET
os.environ.pop("BROWSERBASE_WEBHOOK_SECRET_PREVIOUS", None)

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

ALL_EVENT_TYPES = [
    "functions.invocations.pending",
    "functions.invocations.running",
    "functions.invocations.completed",
    "functions.invocations.failed",
    "functions.builds.running",
    "functions.builds.completed",
    "functions.builds.failed",
]
INVOCATION_ID = "a3f1c2d4-7b90-4e51-9c8a-2f6d1e0b4c73"


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Browserbase (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = webhook_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/browserbase", content=raw_body, headers=headers)


def event(event_type: str, resource_id: str = None, data: dict = None) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": event_type,
        "resourceId": resource_id or str(uuid.uuid4()),
        "data": data or {},
    }


def invocation_completed() -> dict:
    return event("functions.invocations.completed", INVOCATION_ID)


@pytest.fixture(autouse=True)
def reset_env():
    os.environ["BROWSERBASE_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("BROWSERBASE_WEBHOOK_SECRET_PREVIOUS", None)
    yield


class TestValidSignatures:
    @pytest.mark.parametrize("event_type", ALL_EVENT_TYPES)
    def test_accepts_every_documented_event(self, event_type, caplog):
        body = json.dumps(event(event_type))
        with caplog.at_level(logging.INFO, logger="browserbase-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Unhandled" not in caplog.text

    def test_logs_resource_id_for_invocation_completed(self, caplog):
        body = json.dumps(invocation_completed())
        with caplog.at_level(logging.INFO, logger="browserbase-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert f"Invocation {INVOCATION_ID} completed" in caplog.text

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps(event("functions.something.new"))
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_ignores_extra_envelope_keys(self):
        body = json.dumps({**invocation_completed(), "newKey": "value"})
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_accepts_any_matching_signature_in_list(self):
        body = json.dumps(invocation_completed())
        headers = signed_headers(body)
        headers["webhook-signature"] = (
            "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        )
        res = post(body, headers)
        assert res.status_code == 200

    def test_redelivery_of_same_envelope_id_returns_200(self):
        body = json.dumps(invocation_completed())
        first = post(body, signed_headers(body))
        second = post(body, signed_headers(body))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(invocation_completed())
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = json.dumps(invocation_completed())
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_malformed_signature_header(self):
        body = json.dumps(invocation_completed())
        res = post(body, signed_headers(body, signature="not-a-signature"))
        assert res.status_code == 400

    def test_different_secret(self):
        other = "whsec_" + base64.b64encode(b"some-other-secret-key-0123456789").decode()
        body = json.dumps(invocation_completed())
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = json.dumps(invocation_completed())
        headers = signed_headers(body)
        res = post(body.replace("completed", "failed"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = json.dumps(invocation_completed())
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_as_key(self):
        body = json.dumps(invocation_completed())
        msg_id, ts = "msg_undecoded", str(now())
        digest = hmac.new(
            SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
        ).digest()
        wrong = "v1," + base64.b64encode(digest).decode()
        res = post(body, signed_headers(body, webhook_id=msg_id, timestamp=ts, signature=wrong))
        assert res.status_code == 400


class TestSecretRotation:
    def test_previous_secret_accepted(self):
        os.environ["BROWSERBASE_WEBHOOK_SECRET_PREVIOUS"] = PREVIOUS_SECRET
        body = json.dumps(invocation_completed())
        res = post(body, signed_headers(body, secret=PREVIOUS_SECRET))
        assert res.status_code == 200

    def test_previous_secret_rejected_once_removed(self):
        body = json.dumps(invocation_completed())
        res = post(body, signed_headers(body, secret=PREVIOUS_SECRET))
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self):
        os.environ.pop("BROWSERBASE_WEBHOOK_SECRET", None)
        body = json.dumps(invocation_completed())
        res = post(body, signed_headers(body))
        assert res.status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
