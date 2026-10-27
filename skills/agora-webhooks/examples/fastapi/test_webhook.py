import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# The Signing Secret is a free-form string used as UTF-8 bytes
os.environ["AGORA_WEBHOOK_SECRET"] = "agora_test_signing_secret"

from main import app, verify_agora_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["AGORA_WEBHOOK_SECRET"]


def sign(payload: str, secret: str = SECRET) -> str:
    """Same algorithm as Agora: lowercase hex HMAC-SHA1 of the raw body."""
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).hexdigest()


def event(event_type: int) -> str:
    return json.dumps({
        "noticeId": "2000001428:4330:107",
        "productId": 1,
        "eventType": event_type,
        "notifyMs": 1611566412672,
        "payload": {"channelName": "test_webhook", "ts": 1611566412, "uid": 1234, "clientSeq": 1},
    })


def post(body: str, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Agora-Signature"] = signature
    return client.post("/webhooks/agora", content=body.encode(), headers=headers)


class TestVerify:
    body = event(101).encode()

    def test_valid(self):
        assert verify_agora_webhook(self.body, sign(self.body.decode()), SECRET)

    def test_uppercase(self):
        assert verify_agora_webhook(self.body, sign(self.body.decode()).upper(), SECRET)

    def test_rejects_bad_values(self):
        good = sign(self.body.decode())
        assert not verify_agora_webhook(self.body, sign(self.body.decode(), "other"), SECRET)
        assert not verify_agora_webhook(self.body, None, SECRET)
        assert not verify_agora_webhook(self.body, good, None)
        assert not verify_agora_webhook(self.body, good[:38], SECRET)
        assert not verify_agora_webhook(self.body, good + "00", SECRET)
        assert not verify_agora_webhook(self.body, "zz" + good[2:], SECRET)
        assert not verify_agora_webhook(self.body, "sha1=" + good, SECRET)


class TestWebhook:
    @pytest.mark.parametrize("event_type", [101, 102, 103, 104, 105, 111])
    def test_accepts_signed_events(self, event_type):
        body = event(event_type)
        response = post(body, sign(body))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_any_content_type(self):
        body = event(101)
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_verifies_exact_bytes(self):
        body = '{ "productId": 1,   "eventType": 101, "payload": {} }'
        assert post(body, sign(body)).status_code == 200
        assert post(body, sign(json.dumps(json.loads(body)))).status_code == 401

    def test_401_for_missing_malformed_wrong(self):
        body = event(101)
        assert post(body).status_code == 401
        assert post(body, "").status_code == 401
        assert post(body, "not-hex").status_code == 401
        assert post(body, sign(body, "wrong")).status_code == 401

    def test_400_for_signed_non_json(self):
        body = "not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_unknown_event_and_product(self):
        body = json.dumps({"productId": 3, "eventType": 999, "payload": {}})
        assert post(body, sign(body)).status_code == 200
