# Generated with: outhire-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Outhire secrets look like "whsec_" + base64(key bytes). The HMAC key is the
# decoded part after the prefix.
SECRET = "whsec_" + base64.b64encode(b"outhire-test-signing-key-0123456").decode()

os.environ["OUTHIRE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign like Outhire does: HMAC-SHA256 over id.timestamp.body, base64."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    """prefix is 'webhook' (what Outhire sends) or 'svix' (accepted as a fallback)."""
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/outhire", content=raw_body, headers=headers)


def candidate_applied() -> str:
    return json.dumps(
        {
            "event": "candidate.applied",
            "occurred_at": "2026-03-11T00:00:00.000Z",
            "candidate": {
                "id": 123,
                "name": "Jane Doe",
                "email": "jane@example.com",
                "phone": "+61400000000",
                "fit_score": 82,
                "applied_at": "2026-03-11T00:00:00.000Z",
                "resume_url": "https://example.com/resume.pdf",
                "resume_data": {},
                "url": "https://app.outhire.ai/leads/123",
            },
            "job": {"id": 456, "title": "Account Executive"},
            "company": {"id": 789},
        }
    )


def stage_changed() -> str:
    return json.dumps(
        {
            "event": "candidate.stage_changed",
            "occurred_at": "2026-03-11T00:00:00.000Z",
            "candidate": {
                "id": 123,
                "public_id": "cand_abc123",
                "name": "Jane Doe",
                "email": "jane@example.com",
                "url": "https://app.outhire.ai/leads/123",
            },
            "job": {"id": 456, "title": "Account Executive"},
            "company": {"id": 789},
            "stage_change": {
                "previous_stage": "applied",
                "new_stage": "interview",
                "changed_by": "user",
                "changed_by_user_id": "b1c2d3e4-0000-4000-8000-000000000000",
            },
        }
    )


def ping() -> str:
    return json.dumps(
        {
            "event": "webhook.ping",
            "occurred_at": "2026-03-11T00:00:00.000Z",
            "webhook": {"id": 123, "url": "https://example.com/webhooks/outhire"},
        }
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("OUTHIRE_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_candidate_applied(self, caplog):
        caplog.set_level("INFO")
        body = candidate_applied()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "applied to job 456" in caplog.text

    def test_candidate_stage_changed(self, caplog):
        caplog.set_level("INFO")
        body = stage_changed()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "applied -> interview" in caplog.text

    def test_webhook_ping(self, caplog):
        caplog.set_level("INFO")
        body = ping()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Test ping" in caplog.text

    def test_unknown_event_type_is_acknowledged(self):
        body = json.dumps({"event": "candidate.something_new", "occurred_at": "2026-03-11T00:00:00.000Z"})
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_any_content_type(self):
        body = candidate_applied()
        headers = signed_headers(body)
        headers["content-type"] = "application/vnd.api+json"
        assert post(body, headers).status_code == 200

    def test_any_matching_signature_in_list(self):
        body = candidate_applied()
        headers = signed_headers(body)
        headers["webhook-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWc= {headers['webhook-signature']}"
        assert post(body, headers).status_code == 200

    def test_repeated_delivery_is_deduped(self):
        body = candidate_applied()
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestSvixHeaderFallback:
    def test_svix_headers_accepted(self):
        body = candidate_applied()
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_bad_signature_with_svix_headers_rejected(self):
        body = candidate_applied()
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_preferred_when_both_present(self):
        body = candidate_applied()
        headers = {
            **signed_headers(body),
            **signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="),
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        res = post(candidate_applied(), {"content-type": "application/json"})
        assert res.status_code == 400

    def test_partial_headers(self):
        body = candidate_applied()
        headers = signed_headers(body)
        del headers["webhook-signature"]
        assert post(body, headers).status_code == 400

    def test_bad_signature(self):
        body = candidate_applied()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_webhooks_secret(self):
        other = "whsec_" + base64.b64encode(b"another-webhook-secret-012345678").decode()
        body = candidate_applied()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = candidate_applied()
        headers = signed_headers(body)
        res = post(body.replace("Jane", "Mallory"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = candidate_applied()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key(self):
        body = candidate_applied()
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
        monkeypatch.delenv("OUTHIRE_WEBHOOK_SECRET")
        body = candidate_applied()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
