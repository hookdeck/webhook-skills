import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "wkyzvs764ifdrpct2naqhksmq4"  # a Remote signing_key: used as plain UTF-8
os.environ["REMOTE_WEBHOOK_SECRET"] = SECRET
os.environ.pop("REMOTE_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, verify_remote_signature  # noqa: E402

client = TestClient(app)

# Published test vector from https://developer.remote.com/docs/verifying-webhooks
# (compact 376-byte body, exactly as in the docs)
VECTOR_BODY = '{"company_id":"9e88cdac-4e57-46ca-a5a8-580150935cd8","completed_task":{"action":"identity_verification","completed_at":"2023-02-16T07:52:26Z","description":"To help us keep you and our platform safe.","name":"Verify your identity","required":true,"status":"completed"},"employment_id":"b6e66f7c-9026-4afc-9f43-37bb31a8e509","event_type":"employment.onboarding_task.completed"}'
VECTOR_TIMESTAMP = "1677816097219"
VECTOR_SIGNATURE = "e3f4092f158983aea32ab25f6fecc59f64b26d45fadbed6409893f3a882abef7"


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    message = b"".join([body, b":", timestamp.encode("latin-1")])
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def post(body: bytes, headers=None):
    return client.post(
        "/webhooks/remote",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


def signed(payload: dict, timestamp: str = None):
    timestamp = timestamp or str(int(time.time() * 1000))
    body = json.dumps(payload).encode()
    return post(body, {"x-remote-timestamp": timestamp, "x-remote-signature": sign(body, timestamp)})


class TestPublishedVector:
    def test_documented_body_length(self):
        assert len(VECTOR_BODY.encode()) == 376

    def test_computes_documented_signature(self):
        assert sign(VECTOR_BODY.encode(), VECTOR_TIMESTAMP) == VECTOR_SIGNATURE

    def test_accepted_by_verifier(self):
        assert verify_remote_signature(VECTOR_BODY.encode(), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 0)

    def test_accepted_by_endpoint(self):
        res = post(
            VECTOR_BODY.encode(),
            {"x-remote-timestamp": VECTOR_TIMESTAMP, "x-remote-signature": VECTOR_SIGNATURE},
        )
        assert res.status_code == 200


class TestVerifyRemoteSignature:
    body = VECTOR_BODY.encode()

    def test_accepts_uppercase_hex(self):
        assert verify_remote_signature(self.body, VECTOR_SIGNATURE.upper(), VECTOR_TIMESTAMP, SECRET, 0)

    @pytest.mark.parametrize(
        "signature,timestamp",
        [
            (None, VECTOR_TIMESTAMP),
            ("", VECTOR_TIMESTAMP),
            (VECTOR_SIGNATURE, None),
            (VECTOR_SIGNATURE, ""),
            (VECTOR_SIGNATURE[:62], VECTOR_TIMESTAMP),
            ("zz" + VECTOR_SIGNATURE[2:], VECTOR_TIMESTAMP),
            ("sha256=" + VECTOR_SIGNATURE, VECTOR_TIMESTAMP),
            (VECTOR_SIGNATURE + "\n", VECTOR_TIMESTAMP),
            (VECTOR_SIGNATURE, "1677816097220"),
        ],
    )
    def test_rejects_invalid(self, signature, timestamp):
        assert not verify_remote_signature(self.body, signature, timestamp, SECRET, 0)

    def test_rejects_wrong_secret_and_tampered_body(self):
        assert not verify_remote_signature(self.body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, "other-secret", 0)
        assert not verify_remote_signature(self.body + b" ", VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 0)

    def test_rejects_when_no_secret(self, monkeypatch):
        monkeypatch.setenv("REMOTE_WEBHOOK_SECRET", "")
        assert not verify_remote_signature(self.body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP)

    def test_does_not_reject_old_timestamps_by_default(self):
        assert verify_remote_signature(self.body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 0)

    def test_opt_in_tolerance(self):
        # X-Remote-Timestamp is Unix milliseconds; tolerance is in seconds
        assert not verify_remote_signature(self.body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET, 300)
        now = str(int(time.time() * 1000))
        assert verify_remote_signature(self.body, sign(self.body, now), now, SECRET, 300)


class TestEndpoint:
    payload = {
        "company_id": "9e88cdac-4e57-46ca-a5a8-580150935cd8",
        "completed_task": {
            "action": "identity_verification",
            "completed_at": "2023-02-16T07:52:26Z",
            "description": "To help us keep you and our platform safe.",
            "name": "Verify your identity",
            "required": True,
            "status": "completed",
        },
        "employment_id": "b6e66f7c-9026-4afc-9f43-37bb31a8e509",
        "event_type": "employment.onboarding_task.completed",
    }

    def test_accepts_signed_event(self):
        res = signed(self.payload)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize(
        "event_type",
        [
            "employment.onboarding.completed",
            "timeoff.requested",
            "payslip.released",
            "contract.termination_date_reached",
            "expense.submitted",
        ],
    )
    def test_handles_event_types(self, event_type):
        assert signed({**self.payload, "event_type": event_type}).status_code == 200

    def test_missing_signature(self):
        res = post(json.dumps(self.payload).encode(), {"x-remote-timestamp": VECTOR_TIMESTAMP})
        assert res.status_code == 401

    def test_bad_signature(self):
        res = post(
            json.dumps(self.payload).encode(),
            {"x-remote-timestamp": VECTOR_TIMESTAMP, "x-remote-signature": "a" * 64},
        )
        assert res.status_code == 401

    def test_signed_non_json_body(self):
        ts = str(int(time.time() * 1000))
        res = post(b"not json", {"x-remote-timestamp": ts, "x-remote-signature": sign(b"not json", ts)})
        assert res.status_code == 400
