import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
os.environ["VIMEO_WEBHOOK_SECRET"] = "test_secret_key"

from main import app, verify_vimeo  # noqa: E402

client = TestClient(app)

SECRET = os.environ["VIMEO_WEBHOOK_SECRET"]


def sign(payload: bytes, key: str = SECRET) -> str:
    """Generate a real Vimeo signature: lowercase hex HMAC-SHA256 of the raw body."""
    return hmac.new(key.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def payload(webhook_type: str, data: dict) -> bytes:
    return json.dumps(
        {"webhook_type": webhook_type, "data": data, "timestamp": 1644961452}
    ).encode("utf-8")


def send(body: bytes, signature=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Webhook-Signature"] = signature
    return client.post("/webhooks/vimeo", content=body, headers=headers)


EVENTS = [
    ("video-created", {"clip_uri": "/videos/1", "video_uri": "/videos/1"}),
    ("video-deleted", {"clip_uri": "/videos/1", "video_uri": "/videos/1"}),
    ("video-transcode-playable", {"clip_uri": "/videos/1", "video_uri": "/videos/1"}),
    (
        "video-transcode-complete",
        {"clip_uri": "/videos/1", "video_uri": "/videos/1", "version_uri": "/videos/1/versions/1"},
    ),
    (
        "video-upload-failed",
        {"video_uri": "/videos/1", "error_type": "invalid-video-file", "failure_cause": "remote_unauthorized"},
    ),
    (
        "transcript-status-complete",
        {
            "transcript_uri": "/videos/1/transcripts/abc",
            "text_track_uri": "/videos/1/texttracks/2",
            "transcript_status": "completed",
            "video_uri": "/videos/1",
        },
    ),
    ("live-event-started", {"event_uri": "/live_events/9", "clip_uri": "/videos/1", "video_uri": "/videos/1"}),
    ("live-event-ended", {"event_uri": "/live_events/9", "clip_uri": "/videos/1", "video_uri": "/videos/1"}),
]


class TestVimeoWebhook:
    def test_missing_signature_returns_401(self):
        response = send(payload("video-created", {"video_uri": "/videos/1"}))
        assert response.status_code == 401

    def test_wrong_signature_returns_401(self):
        body = payload("video-created", {"video_uri": "/videos/1"})
        response = send(body, sign(body, "other_secret"))
        assert response.status_code == 401

    def test_malformed_signature_returns_401(self):
        body = payload("video-created", {"video_uri": "/videos/1"})
        for bad in ["not-hex", "abcd", "z" * 64, sign(body) + "00"]:
            assert send(body, bad).status_code == 401

    def test_non_ascii_signature_returns_401_not_500(self):
        body = payload("video-created", {"video_uri": "/videos/1"})
        # Latin-1 bytes are valid in an HTTP header value; Starlette decodes them to a non-ASCII str.
        response = send(body, ("é" * 64).encode("latin-1"))
        assert response.status_code == 401

    def test_verify_handles_non_ascii_and_newline(self):
        body = payload("video-created", {"video_uri": "/videos/1"})
        assert verify_vimeo(body, sign(body), SECRET) is True
        assert verify_vimeo(body, "é" * 64, SECRET) is False
        assert verify_vimeo(body, sign(body) + "\n", SECRET) is False

    def test_modified_body_returns_401(self):
        body = payload("video-created", {"video_uri": "/videos/1"})
        tampered = body.replace(b"/videos/1", b"/videos/2")
        assert send(tampered, sign(body)).status_code == 401

    @pytest.mark.parametrize("webhook_type,data", EVENTS)
    def test_signed_event_returns_200(self, webhook_type, data):
        body = payload(webhook_type, data)
        response = send(body, sign(body))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_uppercase_hex_signature_accepted(self):
        body = payload("video-deleted", {"video_uri": "/videos/1"})
        assert send(body, sign(body).upper()).status_code == 200

    def test_any_content_type_verifies(self):
        body = payload("video-deleted", {"video_uri": "/videos/1"})
        for content_type in ["text/plain", "application/octet-stream"]:
            assert send(body, sign(body), content_type).status_code == 200

    def test_unknown_event_returns_200(self):
        body = payload("live-event-updated", {"event_uri": "/live_events/9"})
        assert send(body, sign(body)).status_code == 200

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        assert send(body, sign(body), "text/plain").status_code == 400

    def test_signed_non_object_json_returns_200(self):
        body = b"[1, 2]"
        assert send(body, sign(body)).status_code == 200


class TestHealth:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
