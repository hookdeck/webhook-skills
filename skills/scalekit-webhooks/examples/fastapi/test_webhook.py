# Generated with: scalekit-webhooks skill
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

# scalekit secrets look like "whsec_" + base64(key bytes). The HMAC key is the
# decoded part. Scalekit shows the full whsec_ value on the endpoint page.
SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"

os.environ["SCALEKIT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, processed_event_ids  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like scalekit does: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    """Headers for a delivery. `prefix` is "webhook" (scalekit) or "svix" (fallback)."""
    msg_id = msg_id or f"evt_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/scalekit", content=raw_body, headers=headers)


def event(event_type, data, event_id=None):
    return {
        "spec_version": "1",
        "id": event_id or f"evt_{uuid.uuid4().hex}",
        "environment_id": "env_100000000000000001",
        "occurred_at": "2026-10-01T09:30:00.000Z",
        "organization_id": "org_100000000000000001",
        "type": event_type,
        "data": data,
    }


def directory_user_created():
    return {
        **event(
            "organization.directory.user_created",
            {
                "id": "diruser_100000000000000001",
                "organization_id": "org_100000000000000001",
                "email": "kai@example.com",
                "given_name": "Kai",
                "family_name": "Lindqvist",
                "active": True,
                "groups": [],
                "roles": [],
            },
        ),
        "object": "DirectoryUser",
    }


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SCALEKIT_WEBHOOK_SECRET", SECRET)
    processed_event_ids.clear()


class TestValidSignatures:
    def test_directory_user_created(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "kai@example.com" in caplog.text

    def test_organization_created(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(event("organization.created", {"id": "org_1", "display_name": "Acme"}))
        assert post(body, signed_headers(body)).status_code == 200
        assert "organization.created: org_1 (Acme)" in caplog.text

    def test_directory_group_updated(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(event("organization.directory.group_updated", {"id": "dirgroup_1", "display_name": "Engineering"}))
        assert post(body, signed_headers(body)).status_code == 200
        assert "Engineering" in caplog.text

    def test_user_login_without_organization_id(self, caplog):
        caplog.set_level(logging.INFO)
        evt = event("user.login", {"id": "usr_1"})
        del evt["organization_id"]
        body = json.dumps(evt)
        assert post(body, signed_headers(body)).status_code == 200
        assert "user.login: usr_1" in caplog.text

    def test_unknown_event_type_is_acknowledged(self):
        body = json.dumps(event("organization.something_new", {}))
        assert post(body, signed_headers(body)).status_code == 200

    def test_any_content_type(self):
        body = json.dumps(directory_user_created())
        headers = {**signed_headers(body), "content-type": "application/cloudevents+json"}
        assert post(body, headers).status_code == 200

    def test_any_one_of_several_signatures_matches(self):
        body = json.dumps(directory_user_created())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_other_signature_versions_are_ignored(self):
        body = json.dumps(directory_user_created())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1a,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_retried_delivery_is_skipped(self):
        evt = directory_user_created()
        body = json.dumps(evt)
        first = post(body, signed_headers(body))
        # A retry carries the same id and body but a new timestamp and signature.
        second = post(body, signed_headers(body, msg_id=evt["id"], timestamp=now() + 1))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestSvixHeaderFallback:
    def test_svix_headers_are_accepted(self):
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(directory_user_created())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(directory_user_created())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(directory_user_created())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(directory_user_created())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(directory_user_created())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(directory_user_created())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(directory_user_created())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(directory_user_created())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_unsigned_dashboard_save_check_gets_json_400(self):
        res = post('{"test":true}', {"content-type": "application/json", "user-agent": "scalekit-webhook-validator/1.0"})
        assert res.status_code == 400
        assert res.headers["content-type"].startswith("application/json")

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(directory_user_created())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(directory_user_created())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature_with_svix_headers_is_rejected(self):
        body = json.dumps(directory_user_created())
        res = post(body, signed_headers(body, prefix="svix", signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_webhook_headers_win_when_webhook_id_is_present(self):
        body = json.dumps(directory_user_created())
        headers = {
            **signed_headers(body),
            "svix-id": "ignored",
            "svix-timestamp": "1",
            "svix-signature": "v1,aW52YWxpZA==",
        }
        assert post(body, headers).status_code == 200


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(directory_user_created())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_unsigned_dashboard_save_check_gets_json_400(self):
        res = post('{"test":true}', {"content-type": "application/json", "user-agent": "scalekit-webhook-validator/1.0"})
        assert res.status_code == 400
        assert res.headers["content-type"].startswith("application/json")

    def test_bad_signature(self):
        body = json.dumps(directory_user_created())
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_other_endpoints_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = json.dumps(directory_user_created())
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_tampered_body(self):
        body = json.dumps(directory_user_created())
        headers = signed_headers(body)
        assert post(body.replace("kai@example.com", "eve@example.com"), headers).status_code == 400

    def test_timestamp_outside_tolerance(self):
        body = json.dumps(directory_user_created())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_signature_keyed_with_undecoded_secret(self):
        body = json.dumps(directory_user_created())
        msg_id, ts = "cm_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}")
        assert post(body, headers).status_code == 400


class TestFailClosed:
    def test_secret_not_set(self, monkeypatch):
        monkeypatch.delenv("SCALEKIT_WEBHOOK_SECRET", raising=False)
        body = json.dumps(directory_user_created())
        assert post(body, signed_headers(body)).status_code == 500
