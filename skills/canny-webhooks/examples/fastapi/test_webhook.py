# Generated with: canny-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Canny secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"canny-test-signing-key-0123456789").decode()

os.environ["CANNY_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Canny does (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(
    raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, content_type="application/json"
):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/canny", content=raw_body, headers=headers)


def event(event_type: str, object_type: str, obj: dict) -> dict:
    return {"created": "2026-10-22T10:00:00.000Z", "object": obj, "objectType": object_type, "type": event_type}


def post_object() -> dict:
    return {
        "id": "6a2889c586d7b8843bf4cf05",
        "board": {"id": "6a2889c586d7b8843bf4cf01", "name": "Feature Requests"},
        "status": "planned",
        "title": "An awesome feature request",
    }


def post_created() -> str:
    return json.dumps(event("post.created", "post", post_object()))


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("CANNY_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_post_created(self, caplog):
        body = post_created()
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert 'Post created: "An awesome feature request"' in caplog.text

    def test_post_status_changed(self, caplog):
        body = json.dumps(event("post.status_changed", "post", post_object()))
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert 'status changed to "planned"' in caplog.text

    @pytest.mark.parametrize(
        "event_type,object_type",
        [
            ("post.edited", "post"),
            ("post.deleted", "post"),
            ("post.tag_added", "post"),
            ("post.tag_removed", "post"),
            ("post.jira_issue_linked", "post"),
            ("post.jira_issue_unlinked", "post"),
            ("comment.created", "comment"),
            ("comment.edited", "comment"),
            ("comment.deleted", "comment"),
            ("vote.created", "vote"),
            ("vote.deleted", "vote"),
        ],
    )
    def test_other_event_types(self, event_type, object_type, caplog):
        body = json.dumps(event(event_type, object_type, {"id": "obj_1"}))
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "obj_1" in caplog.text

    def test_unknown_event_type_acknowledged(self, caplog):
        body = json.dumps(event("board.something_new", "board", {"id": "b1"}))
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Canny event type" in caplog.text

    def test_any_content_type(self):
        body = post_created()
        res = post(body, signed_headers(body, content_type="text/plain"))
        assert res.status_code == 200

    def test_two_signatures_one_valid(self):
        body = post_created()
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        res = post(body, headers)
        assert res.status_code == 200

    def test_legacy_canny_headers_ignored(self):
        body = post_created()
        headers = signed_headers(body)
        headers.update({"canny-timestamp": str(now()), "canny-nonce": "abc123", "canny-signature": "not-checked"})
        res = post(body, headers)
        assert res.status_code == 200

    def test_retry_with_same_webhook_id_is_duplicate(self):
        body = post_created()
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = post_created()
        res = post(body, {"content-type": "application/json"})
        assert res.status_code == 400

    def test_only_legacy_canny_headers(self):
        body = post_created()
        res = post(
            body,
            {
                "content-type": "application/json",
                "canny-timestamp": str(now()),
                "canny-nonce": "abc123",
                "canny-signature": "deadbeef",
            },
        )
        assert res.status_code == 400

    def test_bad_signature(self):
        body = post_created()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_wrong_secret(self):
        other = "whsec_" + base64.b64encode(b"another-secret-0123456789abcdef").decode()
        body = post_created()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = post_created()
        headers = signed_headers(body)
        res = post(body.replace("planned", "complete"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = post_created()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key(self):
        body = post_created()
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
        monkeypatch.delenv("CANNY_WEBHOOK_SECRET")
        body = post_created()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
