# Generated with: omnara-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Omnara signing secrets are generated with `openssl rand -base64 32`: bare base64, no whsec_.
# The HMAC key is the base64-decoded value.
KEY = b"omnara-test-signing-key-0123456789"
SECRET = base64.b64encode(KEY).decode()

os.environ["OMNARA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, key: bytes = KEY) -> str:
    """Sign exactly like Omnara does (Standard Webhooks, HMAC-SHA256, base64)."""
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, key=KEY, signature=None, prefix="webhook"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, key),
    }


def post(raw_body, headers):
    return client.post("/webhooks/omnara", content=raw_body, headers=headers)


def timeline(event, **extra):
    return {
        "event": event,
        "data": {
            "id": "evt_5n6a2bfgik7mv4qtrwz3jehcyd",
            "org_id": "org_5n6a2bfgik7mv4qtrwz3jehcyd",
            "project_id": "proj_5n6a2bfgik7mv4qtrwz3jehcyd",
            "agent_id": "agt_5n6a2bfgik7mv4qtrwz3jehcyd",
            "turn_id": "trn_5n6a2bfgik7mv4qtrwz3jehcyd",
            "turn_sequence": 1,
            "is_opening_event": False,
            "sequence": 3,
            "event_kind": event,
            "created_at": "2026-09-18T12:00:00Z",
            **extra,
        },
    }


PAYLOADS = {
    "agent_input": timeline(
        "agent_input",
        agent_input_id="ain_5n6a2bfgik7mv4qtrwz3jehcyd",
        input_kind="content",
        content_blocks=[{"type": "text", "text": "Summarize the report."}],
    ),
    "model_output": timeline(
        "model_output",
        model_call_context_id="mcc_5n6a2bfgik7mv4qtrwz3jehcyd",
        stop_reason="end_turn",
        content_blocks=[{"type": "text", "text": "The report shows steady growth."}],
    ),
    "tool_result": timeline(
        "tool_result",
        tool_call_id="tcl_5n6a2bfgik7mv4qtrwz3jehcyd",
        outcome="succeeded",
        content_blocks=[{"type": "text", "text": "Ticket created."}],
    ),
    "context_checkpoint": timeline(
        "context_checkpoint",
        context_checkpoint_id="ccp_5n6a2bfgik7mv4qtrwz3jehcyd",
        summarized_through_event_sequence=2,
        summary="The user requested a report summary.",
    ),
    "tool_call_update": {
        "event": "tool_call_update",
        "data": {
            "tool_call_id": "tcl_5n6a2bfgik7mv4qtrwz3jehcyd",
            "agent_id": "agt_5n6a2bfgik7mv4qtrwz3jehcyd",
            "state": "awaiting_permission",
            "interaction_update": {
                "id": "int_5n6a2bfgik7mv4qtrwz3jehcyd",
                "interaction_kind": "permission",
                "state": "open",
            },
        },
    },
}


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("OMNARA_WEBHOOK_SECRET", SECRET)


class TestValidDeliveries:
    @pytest.mark.parametrize("event_type", list(PAYLOADS))
    def test_accepts_signed_event(self, event_type):
        raw = json.dumps(PAYLOADS[event_type])
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"success": True, "event": event_type}

    def test_accepts_svix_headers_instead_of_webhook_headers(self):
        raw = json.dumps(PAYLOADS["tool_result"])
        res = post(raw, signed_headers(raw, prefix="svix"))
        assert res.status_code == 200

    def test_accepts_whsec_prefixed_secret(self, monkeypatch):
        monkeypatch.setenv("OMNARA_WEBHOOK_SECRET", f"whsec_{SECRET}")
        raw = json.dumps(PAYLOADS["agent_input"])
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200

    def test_accepts_when_any_v1_entry_matches(self):
        raw = json.dumps(PAYLOADS["model_output"])
        msg_id, ts = "msg_rotation", str(now())
        signature = f"{sign(raw, msg_id, ts, b'old-key')} {sign(raw, msg_id, ts)}"
        res = post(raw, signed_headers(raw, msg_id=msg_id, timestamp=ts, signature=signature))
        assert res.status_code == 200

    def test_verifies_any_content_type(self):
        raw = json.dumps(PAYLOADS["tool_call_update"])
        headers = {**signed_headers(raw), "content-type": "application/cloudevents+json"}
        assert post(raw, headers).status_code == 200

    def test_returns_200_for_unhandled_event(self):
        raw = json.dumps({"event": "something_new", "data": {}})
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json()["event"] == "something_new"


class TestRejections:
    def test_rejects_wrong_signature(self):
        raw = json.dumps(PAYLOADS["agent_input"])
        res = post(raw, signed_headers(raw, key=b"another-key"))
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_rejects_tampered_body(self):
        raw = json.dumps(PAYLOADS["agent_input"])
        headers = signed_headers(raw)
        assert post(raw.replace("Summarize", "Delete"), headers).status_code == 400

    def test_rejects_unsupported_signature_version(self):
        raw = json.dumps(PAYLOADS["agent_input"])
        headers = signed_headers(raw)
        headers["webhook-signature"] = headers["webhook-signature"].replace("v1,", "v1a,")
        assert post(raw, headers).status_code == 400

    def test_rejects_unsigned_delivery(self):
        raw = json.dumps(PAYLOADS["agent_input"])
        headers = signed_headers(raw)
        del headers["webhook-signature"]
        res = post(raw, headers)
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing required webhook headers"

    def test_rejects_request_with_no_webhook_headers(self):
        assert post("{}", {"content-type": "application/json"}).status_code == 400

    def test_rejects_stale_timestamp(self):
        raw = json.dumps(PAYLOADS["agent_input"])
        res = post(raw, signed_headers(raw, timestamp=now() - 600))
        assert res.status_code == 400
        assert res.json()["detail"] == "Timestamp too old"

    def test_rejects_signed_body_that_is_not_json(self):
        raw = "not json"
        res = post(raw, signed_headers(raw))
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("OMNARA_WEBHOOK_SECRET")
        raw = json.dumps(PAYLOADS["agent_input"])
        assert post(raw, signed_headers(raw)).status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
