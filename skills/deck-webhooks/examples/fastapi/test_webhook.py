# Generated with: deck-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from itertools import count

import pytest

# Deck secrets are caller-generated: "whsec_" + base64(random bytes).
# The HMAC key is the base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"deck-test-signing-key-0123456789").decode()
PREVIOUS_SECRET = "whsec_" + base64.b64encode(b"deck-previous-signing-key-012345").decode()

os.environ["DECK_WEBHOOK_SECRET"] = SECRET
os.environ.pop("DECK_WEBHOOK_SECRET_PREVIOUS", None)

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
_counter = count(1)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Deck (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = webhook_id or f"evt_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/deck", content=raw_body, headers=headers)


def event(event_type: str, data: dict) -> dict:
    return {
        "id": f"evt_test{next(_counter)}_{uuid.uuid4().hex[:8]}",
        "object": "event",
        "type": event_type,
        "data": data,
        "created_at": "2025-01-15T09:31:15Z",
    }


def task_run_completed() -> dict:
    return event(
        "task_run.completed",
        {
            "id": "trun_a1b2c3d4",
            "object": "task_run",
            "status": "completed",
            "result": "success",
            "task_id": "task_a1b2c3d4",
            "workflow_id": "",
            "credential_id": "cred_a1b2c3d4",
            "session_id": "sess_a1b2c3d4",
            "agent_id": "agt_a1b2c3d4",
            "source_id": "src_a1b2c3d4",
            "runtime_ms": 12453,
            "created_at": "2025-01-15T09:30:00Z",
            "updated_at": "2025-01-15T09:31:15Z",
        },
    )


@pytest.fixture(autouse=True)
def reset_env():
    os.environ["DECK_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("DECK_WEBHOOK_SECRET_PREVIOUS", None)
    yield
    os.environ["DECK_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("DECK_WEBHOOK_SECRET_PREVIOUS", None)


class TestValidSignatures:
    def test_task_run_completed(self):
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_task_run_interaction_required(self, caplog):
        body = json.dumps(
            event(
                "task_run.interaction_required",
                {
                    "id": "trun_a1b2c3d4",
                    "object": "task_run",
                    "status": "interaction_required",
                    "result": "",
                    "task_id": "task_a1b2c3d4",
                    "workflow_id": "",
                    "credential_id": "cred_a1b2c3d4",
                    "session_id": "sess_a1b2c3d4",
                    "agent_id": "agt_a1b2c3d4",
                    "source_id": "src_a1b2c3d4",
                    "created_at": "2025-01-15T09:30:00Z",
                    "updated_at": "2025-01-15T09:30:30Z",
                    "interaction": {
                        "type": "mfa",
                        "message": "Enter the 6-digit code sent to your phone",
                        "fields": [
                            {"name": "code", "type": "string", "label": "Verification code"}
                        ],
                    },
                },
            )
        )
        with caplog.at_level(logging.INFO, logger="deck-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "needs mfa" in caplog.text

    def test_credential_verified(self):
        body = json.dumps(
            event(
                "credential.verified",
                {
                    "id": "cred_a1b2c3d4",
                    "object": "credential",
                    "status": "verified",
                    "external_id": "user-12345",
                    "source_id": "src_a1b2c3d4",
                    "auth_method": "username_password",
                    "created_at": "2025-01-15T09:28:00Z",
                    "updated_at": "2025-01-15T09:30:00Z",
                },
            )
        )
        assert post(body, signed_headers(body)).status_code == 200

    def test_workflow_run_completed_uses_workflow_run_id(self, caplog):
        body = json.dumps(
            event(
                "workflow_run.completed",
                {
                    "workflow_run_id": "wrun_a1b2c3d4",
                    "workflow_id": "wflo_a1b2c3d4",
                    "org_id": "org_a1b2c3d4",
                    "status": "completed",
                    "result": "success",
                    "session_id": "sess_a1b2c3d4",
                    "trigger_id": None,
                    "created_by": "usr_a1b2c3d4",
                    "created_at": "2025-01-15T09:30:00Z",
                    "updated_at": "2025-01-15T09:32:13Z",
                },
            )
        )
        with caplog.at_level(logging.INFO, logger="deck-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "wrun_a1b2c3d4" in caplog.text

    def test_test_ping(self):
        body = json.dumps(event("test.ping", {"ok": True}))
        assert post(body, signed_headers(body)).status_code == 200

    def test_unknown_event_type_acknowledged(self):
        body = json.dumps(event("something.new", {}))
        assert post(body, signed_headers(body)).status_code == 200

    def test_multiple_signatures_one_valid(self):
        body = json.dumps(task_run_completed())
        headers = signed_headers(body)
        headers["webhook-signature"] = (
            "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        )
        assert post(body, headers).status_code == 200

    def test_duplicate_returns_200(self):
        body = json.dumps(task_run_completed())
        first = post(body, signed_headers(body))
        second = post(body, signed_headers(body))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(task_run_completed())
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_malformed_signature_header(self):
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body, signature="not-a-signature"))
        assert res.status_code == 400

    def test_different_secret(self):
        other = "whsec_" + base64.b64encode(b"some-other-secret-key-0123456789").decode()
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = json.dumps(task_run_completed())
        headers = signed_headers(body)
        res = post(body.replace("success", "failure"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_as_key_rejected(self):
        body = json.dumps(task_run_completed())
        msg_id, ts = "evt_undecoded", str(now())
        wrong = hmac.new(
            SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256
        ).digest()
        res = post(
            body,
            signed_headers(
                body,
                webhook_id=msg_id,
                timestamp=ts,
                signature="v1," + base64.b64encode(wrong).decode(),
            ),
        )
        assert res.status_code == 400


class TestSecretRotation:
    def test_previous_secret_accepted(self):
        os.environ["DECK_WEBHOOK_SECRET_PREVIOUS"] = PREVIOUS_SECRET
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body, secret=PREVIOUS_SECRET))
        assert res.status_code == 200

    def test_previous_secret_rejected_once_removed(self):
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body, secret=PREVIOUS_SECRET))
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self):
        os.environ.pop("DECK_WEBHOOK_SECRET", None)
        body = json.dumps(task_run_completed())
        res = post(body, signed_headers(body))
        assert res.status_code == 500
