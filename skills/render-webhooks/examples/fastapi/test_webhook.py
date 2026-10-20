# Generated with: render-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
from itertools import count

import pytest

# Standard Webhooks secrets are "whsec_" + base64(key bytes). The HMAC key is
# the base64-DECODED part after "whsec_" (the SDK also accepts it unprefixed).
SECRET = "whsec_" + base64.b64encode(b"render-test-signing-key-01234567").decode()

os.environ["RENDER_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
_counter = count(1)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Render (Standard Webhooks)."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(
        key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256
    ).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def notification(event_type: str, status: str = None) -> str:
    """Render's thin payload. `status` only on *_ended events that carry one."""
    data = {
        "id": f"evt-test{next(_counter)}{time.time_ns()}",
        "serviceId": "srv-cukouhrtq21c73e9scng",
        "serviceName": "my-service",
    }
    if status:
        data["status"] = status
    return json.dumps(
        {"type": event_type, "timestamp": "2025-02-25T16:22:19.979294509Z", "data": data}
    )


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = webhook_id or json.loads(raw_body)["data"]["id"]
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body, headers):
    return client.post("/webhooks/render", content=raw_body, headers=headers)


@pytest.fixture(autouse=True)
def reset_secret():
    os.environ["RENDER_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["RENDER_WEBHOOK_SECRET"] = SECRET


class TestValidSignatures:
    def test_deploy_ended_succeeded(self, caplog):
        caplog.set_level("INFO")
        body = notification("deploy_ended", "succeeded")
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Deploy succeeded" in caplog.text

    def test_deploy_ended_failed(self, caplog):
        caplog.set_level("INFO")
        body = notification("deploy_ended", "failed")
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Deploy failed" in caplog.text

    @pytest.mark.parametrize(
        "event_type",
        ["deploy_started", "build_started", "server_failed", "server_available", "autoscaling_ended"],
    )
    def test_common_events(self, event_type):
        body = notification(event_type)
        assert post(body, signed_headers(body)).status_code == 200

    def test_build_ended_canceled(self, caplog):
        caplog.set_level("INFO")
        body = notification("build_ended", "canceled")
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "canceled" in caplog.text

    def test_unprefixed_secret(self):
        os.environ["RENDER_WEBHOOK_SECRET"] = SECRET.removeprefix("whsec_")
        body = notification("deploy_started")
        assert post(body, signed_headers(body)).status_code == 200

    def test_unknown_event_type(self):
        body = notification("some_future_event")
        assert post(body, signed_headers(body)).status_code == 200

    def test_multiple_signatures(self):
        body = notification("deploy_started")
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_retry_is_deduplicated(self):
        body = notification("deploy_ended", "succeeded")
        first = post(body, signed_headers(body))
        retry = post(body, signed_headers(body, timestamp=now() + 1))
        assert first.status_code == 200
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = notification("deploy_started")
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature(self):
        body = notification("deploy_started")
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_malformed_signature_header(self):
        body = notification("deploy_started")
        assert post(body, signed_headers(body, signature="not-a-signature")).status_code == 400

    def test_different_secret(self):
        other = "whsec_" + base64.b64encode(b"some-other-secret-key-0123456789").decode()
        body = notification("deploy_started")
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_tampered_body(self):
        body = notification("deploy_ended", "failed")
        headers = signed_headers(body)
        assert post(body.replace("failed", "succeeded"), headers).status_code == 400

    def test_stale_timestamp(self):
        body = notification("deploy_started")
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self):
        del os.environ["RENDER_WEBHOOK_SECRET"]
        body = notification("deploy_started")
        assert post(body, signed_headers(body)).status_code == 500
