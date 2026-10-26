import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
os.environ["TEACHFLOOR_WEBHOOK_SECRET"] = "test_teachfloor_signing_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_teachfloor_signature

client = TestClient(app)

SECRET = os.environ["TEACHFLOOR_WEBHOOK_SECRET"]

EVENTS = [
    "course.created",
    "course.updated",
    "course.completed",
    "course.join",
    "module.created",
    "module.updated",
    "element.created",
    "element.updated",
    "element.deleted",
    "element.completed",
    "member.login",
    "something.else",
]

# Payloads follow Teachfloor's documented course.join and element.completed examples.
MEMBER = {"id": "usr_123", "object": "member", "full_name": "John Doe", "email": "john@example.com"}


def sample_payload(event_type="course.join"):
    if event_type == "element.completed":
        return {
            "id": "evt_def456",
            "type": event_type,
            "created_at": "2025-10-07T15:30:00.000000Z",
            "data": {
                "id": "act_789",
                "object": "activity",
                "status": "completed",
                "passed": True,
                "score": 95,
                "member": MEMBER,
                "context": {"id": "elm_321", "object": "element", "name": "Introduction Video",
                            "type": "video", "module": "mod_654"},
            },
        }
    return {
        "id": "evt_abc123",
        "type": event_type,
        "created_at": "2025-10-07T15:30:00.000000Z",
        "data": {
            "id": "cm_xyz789",
            "object": "course_member",
            "member": MEMBER,
            "course": {"id": "crs_456", "object": "course", "name": "Introduction to Development",
                       "status": "published"},
        },
    }


def sign(body, secret=SECRET):
    """teachfloor-signature = hex HMAC-SHA256 of the raw body, keyed with the signing secret."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body=None, signature=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    headers = {"content-type": content_type}
    if signature is not None:
        headers["teachfloor-signature"] = signature
    return client.post("/webhooks/teachfloor", content=body, headers=headers)


class TestTeachfloorWebhook:
    def test_accepts_valid_signature(self):
        body = json.dumps(sample_payload())
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body).upper()).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    def test_verifies_exact_bytes_received(self):
        body = '{ "type" :   "course.join" }\n'
        assert post(body, sign(body)).status_code == 200

    def test_rejects_wrong_secret(self):
        body = json.dumps(sample_payload())
        assert post(body, sign(body, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        signed = json.dumps(sample_payload())
        tampered = json.dumps(sample_payload("course.completed"))
        assert post(tampered, sign(signed)).status_code == 401

    def test_rejects_missing_signature(self):
        assert post().status_code == 401

    def test_rejects_malformed_signatures(self):
        body = json.dumps(sample_payload())
        good = sign(body)
        for bad in ["abc", good[:62], good + "00", "z" * 64, f"sha256={good}"]:
            assert post(body, bad).status_code == 401

    def test_non_ascii_signature_is_401_not_500(self):
        body = json.dumps(sample_payload())
        res = client.post(
            "/webhooks/teachfloor",
            content=body,
            headers={"content-type": "application/json", "teachfloor-signature": ("é" * 64).encode("utf-8")},  # httpx needs bytes for non-ASCII
        )
        assert res.status_code == 401

    def test_invalid_json_after_valid_signature_is_400(self):
        assert post("not json", sign("not json")).status_code == 400

    def test_json_array_is_400(self):
        assert post("[1,2]", sign("[1,2]")).status_code == 400

    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type):
        body = json.dumps(sample_payload(event_type))
        assert post(body, sign(body)).status_code == 200

    @pytest.mark.parametrize("payload", [
        {"type": "course.join", "data": "oops"},
        {"type": "course.join", "data": {"member": 5, "course": []}},
        {"type": "element.completed", "data": {"member": None, "context": "x"}},
        {"type": "member.login", "data": None},
        {"type": 42, "data": []},
        {},
    ])
    def test_wrong_typed_fields_do_not_cause_500(self, payload):
        body = json.dumps(payload)
        assert post(body, sign(body)).status_code == 200


class TestVerifyTeachfloorSignature:
    body = json.dumps(sample_payload()).encode()

    def test_accepts_matching_signature(self):
        assert verify_teachfloor_signature(self.body, sign(self.body), SECRET) is True

    def test_rejects_when_no_secret_configured(self, monkeypatch):
        monkeypatch.delenv("TEACHFLOOR_WEBHOOK_SECRET")
        assert verify_teachfloor_signature(self.body, sign(self.body)) is False
        assert verify_teachfloor_signature(self.body, sign(self.body, ""), "") is False

    def test_rejects_missing_or_non_string_signature(self):
        assert verify_teachfloor_signature(self.body, None, SECRET) is False
        assert verify_teachfloor_signature(self.body, b"abc", SECRET) is False

    def test_non_ascii_signature_returns_false(self):
        assert verify_teachfloor_signature(self.body, "é" * 64, SECRET) is False
