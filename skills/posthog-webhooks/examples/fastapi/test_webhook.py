import base64
import hashlib
import hmac
import os
import time

import pytest
from fastapi.testclient import TestClient

# whsec_ + base64 of 32 bytes (PostHog requires at least 24 decoded bytes)
SECRET = "whsec_" + base64.b64encode(b"test_secret_key_32_bytes_long!!!!").decode()
OTHER_SECRET = "whsec_" + base64.b64encode(b"another_secret_key_32_bytes_long!").decode()

from main import app  # noqa: E402

client = TestClient(app)

PAGEVIEW = (
    '{"event":{"event":"$pageview","uuid":"0190-abc","distinct_id":"user_1",'
    '"properties":{"$current_url":"https://example.com"}},"person":{"id":"p1"}}'
)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("POSTHOG_WEBHOOK_SECRET", SECRET)


def sign(body: str, secret: str = SECRET, msg_id: str = "msg_test_1", timestamp=None) -> dict:
    ts = str(int(time.time()) if timestamp is None else timestamp)
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
    return {
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": "v1," + base64.b64encode(digest).decode(),
    }


def post(body: str, headers: dict, content_type: str = "application/json"):
    return client.post(
        "/webhooks/posthog",
        content=body,
        headers={"content-type": content_type, **headers},
    )


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_valid_signature():
    res = post(PAGEVIEW, sign(PAGEVIEW))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_any_content_type():
    assert post(PAGEVIEW, sign(PAGEVIEW), "text/plain").status_code == 200


@pytest.mark.parametrize("name", ["$identify", "signed_up"])
def test_other_events(name):
    body = '{"event":{"event":"%s","distinct_id":"u"},"person":{}}' % name
    assert post(body, sign(body)).status_code == 200


def test_tampered_body():
    assert post(PAGEVIEW.replace("user_1", "user_2"), sign(PAGEVIEW)).status_code == 400


def test_wrong_secret():
    assert post(PAGEVIEW, sign(PAGEVIEW, OTHER_SECRET)).status_code == 400


def test_old_timestamp():
    assert post(PAGEVIEW, sign(PAGEVIEW, timestamp=int(time.time()) - 600)).status_code == 400


def test_missing_headers():
    assert post(PAGEVIEW, {}).status_code == 400
