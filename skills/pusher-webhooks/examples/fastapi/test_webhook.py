import hashlib
import hmac
import json
import os
import time

APP_KEY = "a1b2c3d4e5f6a7b8c9d0"
APP_SECRET = "f0e1d2c3b4a5968778695a4b3c2d1e0f"  # Pusher app secrets are opaque hex strings

os.environ["PUSHER_APP_ID"] = "123456"
os.environ["PUSHER_APP_KEY"] = APP_KEY
os.environ["PUSHER_APP_SECRET"] = APP_SECRET
os.environ["PUSHER_CLUSTER"] = "mt1"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = APP_SECRET) -> str:
    """Pusher: hex HMAC-SHA256 of the raw body, keyed with the app secret."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def make_body(events, time_ms=None) -> bytes:
    return json.dumps(
        {"time_ms": time_ms if time_ms is not None else int(time.time() * 1000), "events": events}
    ).encode()


def post(body: bytes, key=APP_KEY, signature="auto", content_type="application/json"):
    headers = {"Content-Type": content_type}
    if key:
        headers["X-Pusher-Key"] = key
    if signature == "auto":
        signature = sign(body)
    if signature:
        headers["X-Pusher-Signature"] = signature
    return client.post("/webhooks/pusher", content=body, headers=headers)


class TestPusherWebhook:
    def test_accepts_valid_channel_occupied(self, capsys):
        res = post(make_body([{"name": "channel_occupied", "channel": "my-channel"}]))
        assert res.status_code == 200
        assert "Channel occupied: my-channel" in capsys.readouterr().out

    def test_handles_every_documented_event_type(self, capsys):
        res = post(
            make_body(
                [
                    {"name": "channel_occupied", "channel": "c1"},
                    {"name": "channel_vacated", "channel": "c1"},
                    {"name": "member_added", "channel": "presence-r", "user_id": "u1"},
                    {"name": "member_removed", "channel": "presence-r", "user_id": "u1"},
                    {
                        "name": "client_event",
                        "channel": "private-c",
                        "event": "client-typing",
                        "data": "{}",
                        "socket_id": "1.2",
                    },
                    {"name": "cache_miss", "channel": "cache-c"},
                    {"name": "subscription_count", "channel": "c1", "subscription_count": 3},
                ]
            )
        )
        assert res.status_code == 200
        out = capsys.readouterr().out
        assert "Channel vacated: c1" in out
        assert "Member u1 joined presence-r" in out
        assert "Member u1 left presence-r" in out
        assert "Client event client-typing on private-c from 1.2" in out
        assert "Cache miss on cache-c" in out
        assert "Subscription count on c1: 3" in out

    def test_processes_every_event_in_a_batch(self, capsys):
        res = post(
            make_body(
                [
                    {"name": "channel_occupied", "channel": "a"},
                    {"name": "channel_occupied", "channel": "b"},
                ]
            )
        )
        assert res.status_code == 200
        out = capsys.readouterr().out
        assert "Channel occupied: a" in out
        assert "Channel occupied: b" in out

    def test_rejects_invalid_signature(self):
        body = make_body([{"name": "channel_occupied", "channel": "x"}])
        assert post(body, signature="deadbeef").status_code == 400

    def test_rejects_signature_from_wrong_secret(self):
        body = make_body([{"name": "channel_occupied", "channel": "x"}])
        assert post(body, signature=sign(body, "wrong-secret")).status_code == 400

    def test_rejects_tampered_body(self):
        body = make_body([{"name": "channel_occupied", "channel": "x"}])
        signature = sign(body)
        assert post(body.replace(b'"x"', b'"y"'), signature=signature).status_code == 400

    def test_rejects_missing_signature_header(self):
        body = make_body([{"name": "channel_occupied", "channel": "x"}])
        assert post(body, signature=None).status_code == 400

    def test_rejects_unknown_key(self):
        body = make_body([{"name": "channel_occupied", "channel": "x"}])
        assert post(body, key="other-key").status_code == 400

    def test_rejects_stale_time_ms(self):
        # The Python SDK rejects bodies whose time_ms is more than 5 minutes off
        stale = int((time.time() - 3600) * 1000)
        body = make_body([{"name": "channel_occupied", "channel": "x"}], time_ms=stale)
        assert post(body).status_code == 400
