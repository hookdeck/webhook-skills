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
    """Sign per Standard Webhooks: base64(HMAC-SHA256(key, '{id}.{ts}.{body}'))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/argil", content=raw_body, headers=headers)


def video_success() -> str:
    return json.dumps(
        {
            "event": "VIDEO_GENERATION_SUCCESS",
            "data": {
                "videoId": "vid_123",
                "videoName": "Launch teaser",
                "videoUrl": "https://cdn.argil.ai/videos/vid_123.mp4",
                "message": "Video generation completed successfully",
                "extras": {"campaign": "spring"},
                "renderCost": 150,
                "renderCostRefunded": False,
            },
        }
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("ARGIL_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_video_generation_success(self, caplog):
        body = video_success()
        with caplog.at_level(logging.INFO, logger="argil-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Video ready: vid_123" in caplog.text

    def test_video_generation_failed(self, caplog):
        body = json.dumps(
            {
                "event": "VIDEO_GENERATION_FAILED",
                "data": {
                    "videoId": "vid_124",
                    "videoName": "Launch teaser",
                    "message": "Render crashed",
                    "extras": {},
                    "renderCost": 150,
                    "renderCostRefunded": True,
                },
            }
        )
        with caplog.at_level(logging.INFO, logger="argil-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Render crashed" in caplog.text
        assert "refunded True" in caplog.text

    def test_avatar_training_success(self, caplog):
        body = json.dumps(
            {
                "event": "AVATAR_TRAINING_SUCCESS",
                "data": {"avatarId": "av_1", "voiceId": "vo_1", "avatarName": "Sam", "extras": {}},
            }
        )
        with caplog.at_level(logging.INFO, logger="argil-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Avatar trained: av_1" in caplog.text

    def test_avatar_training_failed(self, caplog):
        body = json.dumps(
            {
                "event": "AVATAR_TRAINING_FAILED",
                "data": {"avatarId": "av_2", "avatarName": "Sam", "extras": {}},
            }
        )
        with caplog.at_level(logging.INFO, logger="argil-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Avatar training failed: av_2" in caplog.text

    def test_unknown_event_acknowledged(self, caplog):
        body = json.dumps({"event": "SOMETHING_NEW", "data": {}})
        with caplog.at_level(logging.INFO, logger="argil-webhooks"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled Argil event" in caplog.text

    def test_svix_prefixed_headers_fallback(self):
        body = video_success()
        res = post(body, signed_headers(body, prefix="svix"))
        assert res.status_code == 200

    def test_any_of_multiple_signatures(self):
        body = video_success()
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        res = post(body, headers)
        assert res.status_code == 200

    def test_duplicate_delivery_same_webhook_id(self):
        body = video_success()
        msg_id = f"msg_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers_returns_400_with_recreate_hint(self):
        res = post(video_success(), {"content-type": "application/json"})
        assert res.status_code == 400
        assert "ecreate the webhook" in res.json()["detail"]

    def test_bad_signature(self):
        body = video_success()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_webhooks_secret(self):
        other = "whsec_" + base64.b64encode(b"another-webhook-secret-0123456789").decode()
        body = video_success()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = video_success()
        headers = signed_headers(body)
        res = post(body.replace("vid_123", "vid_999"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = video_success()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key_rejected(self):
        body = video_success()
        msg_id, ts = "msg_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        res = post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("ARGIL_WEBHOOK_SECRET", raising=False)
        body = video_success()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
