# Generated with: argil-webhooks skill
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

# Argil secrets look like "whsec_" + base64(key bytes), for example
# "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"argil-test-signing-key-0123456789").decode()

os.environ["ARGIL_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Argil does (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/argil", content=raw_body, headers=headers)


def video_success() -> dict:
    return {
        "event": "VIDEO_GENERATION_SUCCESS",
        "data": {
            "videoId": "vid_123",
            "videoName": "Product intro",
            "videoUrl": "https://example.com/video.mp4",
            "message": "Video generated",
            "extras": {},
            "renderCost": 10,
            "renderCostRefunded": 0,
        },
    }


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("ARGIL_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_video_generation_success(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(video_success())
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Video ready: vid_123" in caplog.text

    def test_video_generation_failed(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps({
            "event": "VIDEO_GENERATION_FAILED",
            "data": {"videoId": "vid_9", "videoName": "x", "message": "render error",
                     "extras": {}, "renderCost": 10, "renderCostRefunded": 10},
        })
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Video failed: vid_9" in caplog.text

    def test_avatar_training_success(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps({"event": "AVATAR_TRAINING_SUCCESS",
                           "data": {"avatarId": "avt_1", "avatarName": "Alex", "extras": {}}})
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Avatar trained: avt_1" in caplog.text

    def test_avatar_training_failed(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps({"event": "AVATAR_TRAINING_FAILED",
                           "data": {"avatarId": "avt_2", "avatarName": "Sam", "extras": {}}})
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Avatar training failed: avt_2" in caplog.text

    def test_unknown_event_is_acknowledged(self):
        body = json.dumps({"event": "SOMETHING_NEW", "data": {}})
        assert post(body, signed_headers(body)).status_code == 200

    def test_any_content_type(self):
        body = json.dumps(video_success())
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_any_one_of_several_signatures(self):
        body = json.dumps(video_success())
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_retry_with_same_webhook_id_is_deduplicated(self):
        body = json.dumps(video_success())
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_unsigned_delivery_rejected(self):
        body = json.dumps(video_success())
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature(self):
        body = json.dumps(video_success())
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_webhooks_secret(self):
        other = "whsec_" + base64.b64encode(b"another-webhook-secret-0123456789").decode()
        body = json.dumps(video_success())
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_tampered_body(self):
        body = json.dumps(video_success())
        headers = signed_headers(body)
        assert post(body.replace("vid_123", "vid_999"), headers).status_code == 400

    def test_timestamp_outside_library_window(self):
        body = json.dumps(video_success())
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_undecoded_secret_key_rejected(self):
        body = json.dumps(video_success())
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}")
        assert post(body, headers).status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("ARGIL_WEBHOOK_SECRET", raising=False)
        body = json.dumps(video_success())
        assert post(body, signed_headers(body)).status_code == 500
