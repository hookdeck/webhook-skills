import json
import os

# Set test environment variables before importing the app
os.environ["GUMLET_WEBHOOK_SECRET"] = "test_gumlet_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_gumlet_request

client = TestClient(app)

SECRET = os.environ["GUMLET_WEBHOOK_SECRET"]

EVENTS = [
    "video.status.created",
    "video.status.stream_ready",
    "video.status.downloaded",
    "video.status.processed",
    "video.status.ready",
    "video.status.errored",
    "video.status.deleted",
    "video.status.repackaged",
    "live.video.status.created",
    "live.video.status.preparing",
    "live.video.status.ready",
    "live.video.status.connected",
    "live.video.status.active",
    "live.video.status.disconnected",
    "live.video.status.complete",
    "event.video.uploaded",
    "event.video.updated",
    "event.embed.viewed",
    "event.embed.cta_clicked",
    "event.embed.form_submitted",
    "event.playlist.created",
    "event.playlist.asset",
    "event.playlist.deleted",
    "event.comment.all",
    "event.channel.member_joined",
]


# Based on the documented video.status.ready sample.
def sample_payload(type_="video.status.ready"):
    return {
        "input": {
            "source_url": "http://devimages.apple.com/iphone/samples/bipbop/bipbopall.m3u8",
            "transformations": {"format": "abr", "resolution": ["360p", "480p", "720p", "1080p"]},
            "profile_id": "646df1c9173a4a2fcac180b7",
            "width": 1920,
            "height": 1080,
        },
        "output": {
            "format": "abr",
            "playback_url": "https://video.gumlet.io/646df1c9173a4a2fcac180b4/65b168a6e99b77f116c0e488/main.m3u8",
            "download_url": "https://video.gumlet.io/646df1c9173a4a2fcac180b4/65b168a6e99b77f116c0e488/download.mp4",
        },
        "type": type_,
        "status": type_.split(".")[-1],
        "asset_id": "65b168a6e99b77f116c0e488",
        "created_at": 1706125479006,
        "tag": ["ball"],
        "title": "Example Title",
        "description": "some description",
    }


# Based on the documented live.video.status.complete sample.
LIVE_COMPLETE = {
    "input": {
        "live_video_source_id": "68678418fc386bd77fd5c689",
        "resolution": ["360p", "480p", "720p", "1080p"],
        "title": "Live stream at 04:25:38 on 2nd September",
    },
    "output": {
        "playback_url": "https://video.gumlet.io/68678418fc386bd77fd5c689/68b671c1373a93b5103e1f9a/master.m3u8",
        "embed_url": "https://play.gumlet.io/embed/live/68b671c1373a93b5103e1f9a",
        "storage_size": 0,
        "duration": 0,
        "recording_playback_url": "https://video.gumlet.io/68678419fc386bd77fd5c69c/68b671c1373a93b5103e1f9c/main.m3u8",
    },
    "type": "live.video.status.complete",
    "status": "complete",
    "live_asset_id": "68b671c1373a93b5103e1f9a",
    "created_at": 1756787138405,
    "updated_at": 1756787392403,
    "recording_asset_id": "68b671c1373a93b5103e1f9c",
    "vod_collection_id": "68678419fc386bd77fd5c69c",
}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/gumlet",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestTokenVerification:
    def test_correct_token(self):
        res = post({"x-gumlet-token": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"X-Gumlet-Token": SECRET}).status_code == 200

    def test_wrong_token_same_length(self):
        assert post({"x-gumlet-token": "x" * len(SECRET)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({"x-gumlet-token": "short"}).status_code == 401

    def test_prefix_match_is_rejected(self):
        assert post({"x-gumlet-token": SECRET + "-extra"}).status_code == 401

    def test_missing_token(self):
        assert post().status_code == 401

    def test_non_ascii_token_does_not_raise(self):
        # compare_digest raises TypeError on non-ASCII str; we compare bytes.
        assert verify_gumlet_request({"x-gumlet-token": "t\u00f6ken"}, secret=SECRET) is False
        assert verify_gumlet_request({"x-gumlet-token": "t\u00f6ken"}, secret="t\u00f6ken") is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_gumlet_request({"x-gumlet-token": SECRET}, secret="") is False
        assert verify_gumlet_request({"x-gumlet-token": SECRET}, secret=SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"x-gumlet-token": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"x-gumlet-token": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"x-gumlet-token": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_token_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"x-gumlet-token": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_documented_live_complete_payload(self, capsys):
        res = post({"x-gumlet-token": SECRET}, body=json.dumps(LIVE_COMPLETE))
        assert res.status_code == 200
        assert "Live stream complete: 68b671c1373a93b5103e1f9a" in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"x-gumlet-token": SECRET}, body=json.dumps(sample_payload("something.new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
