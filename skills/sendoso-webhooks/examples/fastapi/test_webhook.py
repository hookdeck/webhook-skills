# Generated with: sendoso-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from itertools import count

import pytest

# Sendoso (Svix) endpoint secrets are "whsec_" + base64. The HMAC key is the
# base64-DECODED part after "whsec_".
SECRET = "whsec_" + base64.b64encode(b"sendoso-test-signing-key-0123456").decode()

os.environ["SENDOSO_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
_counter = count(1)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Sendoso/Svix."""
    key = base64.b64decode(secret.split("_", 1)[1])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/sendoso", content=raw_body, headers=headers)


def status_change(status_changed_at="2026-10-21T09:31:15Z") -> dict:
    return {
        "send_gid": f"gid://sendoso/Send/{1000 + next(_counter)}",
        "status_changed_at": status_changed_at,
    }


@pytest.fixture(autouse=True)
def _secret():
    os.environ["SENDOSO_WEBHOOK_SECRET"] = SECRET
    yield


class TestValidSignatures:
    def test_accepts_signed_status_change(self):
        body = json.dumps(status_change())
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_when_any_of_several_signatures_matches(self):
        body = json.dumps(status_change())
        headers = signed_headers(body)
        headers["svix-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWc= {headers['svix-signature']}"
        assert post(body, headers).status_code == 200

    def test_duplicate_svix_id_returns_200_without_reprocessing(self):
        body = json.dumps(status_change())
        first = post(body, signed_headers(body, msg_id="msg_duplicate_test"))
        second = post(body, signed_headers(body, msg_id="msg_duplicate_test"))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}

    def test_stale_update_is_acknowledged_but_ignored(self):
        send_gid = "gid://sendoso/Send/stale-check"
        newer = json.dumps({"send_gid": send_gid, "status_changed_at": "2026-10-21T10:00:00Z"})
        older = json.dumps({"send_gid": send_gid, "status_changed_at": "2026-10-21T09:00:00Z"})
        assert post(newer, signed_headers(newer)).status_code == 200
        res = post(older, signed_headers(older))
        assert res.status_code == 200
        assert res.json() == {"received": True, "stale": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(status_change())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature(self):
        body = json.dumps(status_change())
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_malformed_signature_header(self):
        body = json.dumps(status_change())
        assert post(body, signed_headers(body, signature="garbage")).status_code == 400

    def test_different_endpoint_secret(self):
        other = "whsec_" + base64.b64encode(b"another-endpoint-secret-01234567").decode()
        body = json.dumps(status_change())
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_tampered_body(self):
        body = json.dumps(status_change())
        headers = signed_headers(body)
        assert post(body.replace("Send/", "Send/9"), headers).status_code == 400

    def test_timestamp_too_old(self):
        body = json.dumps(status_change())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_timestamp_too_new(self):
        body = json.dumps(status_change())
        assert post(body, signed_headers(body, timestamp=now() + 600)).status_code == 400

    def test_signature_keyed_with_undecoded_secret(self):
        body = json.dumps(status_change())
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET.split("_", 1)[1].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}")
        assert post(body, headers).status_code == 400

    def test_payload_without_send_gid(self):
        body = json.dumps({"status_changed_at": "2026-10-21T09:31:15Z"})
        assert post(body, signed_headers(body)).status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self):
        del os.environ["SENDOSO_WEBHOOK_SECRET"]
        body = json.dumps(status_change())
        assert post(body, signed_headers(body)).status_code == 500
