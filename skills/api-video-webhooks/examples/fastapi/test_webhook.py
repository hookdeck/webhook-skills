import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "sig_sec_test_secret_0000000000"
os.environ["API_VIDEO_WEBHOOK_SECRET"] = SECRET

from main import app, verify_api_video_signature  # noqa: E402

client = TestClient(app)

# Published example from api.video's docs (byte-exact body, do not reformat)
VECTOR_SECRET = "sig_sec_0000000000000000000000"
VECTOR_BODY = '{"type":"video.encoding.quality.completed","emittedAt":"2021-01-29T15:46:25.217Z","videoId":"vi0000000000000000000000","liveStreamId":"li0000000000000000000000","encoding":"hls","quality":"720p"}'
VECTOR_SIGNATURE = "27a77d3a7fc626854886b5dbfae4e32c8b0170c1ea1b714c91ba77f1e7774e8c"


def sign(payload: str, key: str = SECRET) -> str:
    return hmac.new(key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def post(payload: str, signature: str | None = None):
    headers = {"content-type": "application/json"}
    if signature is not None:
        headers["x-api-video-signature"] = signature
    return client.post("/webhooks/api-video", content=payload, headers=headers)


class TestVerifyApiVideoSignature:
    def test_accepts_published_test_vector(self):
        assert verify_api_video_signature(VECTOR_BODY.encode(), VECTOR_SIGNATURE, VECTOR_SECRET)

    def test_accepts_valid_and_uppercase_signature(self):
        body = b'{"type":"video.source.recorded"}'
        sig = sign(body.decode())
        assert verify_api_video_signature(body, sig, SECRET)
        assert verify_api_video_signature(body, sig.upper(), SECRET)

    def test_rejects_missing_or_empty_signature(self):
        assert not verify_api_video_signature(b"{}", None, SECRET)
        assert not verify_api_video_signature(b"{}", "", SECRET)

    def test_rejects_wrong_secret_and_tampered_body(self):
        body = b'{"type":"video.source.recorded"}'
        assert not verify_api_video_signature(body, sign(body.decode(), "other"), SECRET)
        assert not verify_api_video_signature(b'{"type":"x"}', sign(body.decode()), SECRET)

    @pytest.mark.parametrize("bad", ["a" * 62, "a" * 66, "z" * 64, "sha256=" + "a" * 64])
    def test_rejects_malformed_signature(self, bad):
        assert not verify_api_video_signature(b"{}", bad, SECRET)


class TestWebhookEndpoint:
    def test_accepts_published_test_vector(self):
        os.environ["API_VIDEO_WEBHOOK_SECRET"] = VECTOR_SECRET
        try:
            assert post(VECTOR_BODY, VECTOR_SIGNATURE).status_code == 200
        finally:
            os.environ["API_VIDEO_WEBHOOK_SECRET"] = SECRET

    def test_missing_signature_returns_401(self):
        assert post('{"type":"video.source.recorded"}').status_code == 401

    def test_invalid_signature_returns_401(self):
        assert post('{"type":"video.source.recorded"}', "a" * 64).status_code == 401

    @pytest.mark.parametrize(
        "event_type,fields",
        [
            ("video.encoding.quality.completed", {"videoId": "vi1", "encoding": "hls", "quality": "720p"}),
            ("video.source.recorded", {"videoId": "vi1"}),
            ("live-stream.broadcast.started", {"liveStreamId": "li1"}),
            ("live-stream.broadcast.ended", {"liveStreamId": "li1"}),
            ("video.caption.generated", {"videoId": "vi1"}),
            ("video.summary.generated", {"videoId": "vi1"}),
            ("video.unknown.event", {}),
        ],
    )
    def test_valid_events_return_200(self, event_type, fields):
        payload = json.dumps({"type": event_type, "emittedAt": "2021-01-29T15:46:25.217Z", **fields})
        assert post(payload, sign(payload)).status_code == 200

    def test_signed_non_json_returns_400(self):
        assert post("not json", sign("not json")).status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
