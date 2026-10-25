import os
import hmac
import hashlib
import base64
import json

import pytest
from fastapi.testclient import TestClient

CLIENT_SECRET = "test_jobber_client_secret"
os.environ["JOBBER_CLIENT_SECRET"] = CLIENT_SECRET

from main import app, verify_jobber_signature  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = CLIENT_SECRET) -> str:
    """Jobber signs the raw body: base64(HMAC-SHA256(rawBody, clientSecret))."""
    return base64.b64encode(hmac.new(secret.encode(), payload, hashlib.sha256).digest()).decode()


def sample_payload(topic: str = "CLIENT_CREATE") -> bytes:
    return json.dumps(
        {
            "data": {
                "webHookEvent": {
                    "topic": topic,
                    "appId": "3ef22a50-072d-430c-a78f-b7646657560b",
                    "accountId": "MQ==",
                    "itemId": "MQ==",
                    "occurredAt": "2026-07-16T16:31:31-06:00",
                }
            }
        }
    ).encode()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-jobber-hmac-sha256"] = signature
    return client.post("/webhooks/jobber", content=body, headers=headers)


class TestVerify:
    body = sample_payload()

    def test_accepts_valid_signature(self):
        assert verify_jobber_signature(self.body, sign(self.body), CLIENT_SECRET)

    def test_rejects_other_secret(self):
        assert not verify_jobber_signature(self.body, sign(self.body, "other"), CLIENT_SECRET)

    def test_rejects_missing_header(self):
        assert not verify_jobber_signature(self.body, None, CLIENT_SECRET)

    def test_rejects_non_ascii_header_without_raising(self):
        assert not verify_jobber_signature(self.body, "sïgnature", CLIENT_SECRET)

    def test_rejects_trailing_junk(self):
        assert not verify_jobber_signature(self.body, sign(self.body) + "xx", CLIENT_SECRET)


class TestWebhook:
    def test_valid_client_create(self):
        body = sample_payload("CLIENT_CREATE")
        assert post(body, sign(body)).status_code == 200

    @pytest.mark.parametrize("topic", ["INVOICE_UPDATE", "APP_CONNECT", "APP_DISCONNECT", "SOMETHING_ELSE"])
    def test_other_topics(self, topic):
        body = sample_payload(topic)
        assert post(body, sign(body)).status_code == 200

    def test_any_content_type(self):
        body = sample_payload()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_invalid_signature(self):
        assert post(sample_payload(), sign(b"different body")).status_code == 401

    def test_missing_signature(self):
        assert post(sample_payload()).status_code == 401

    def test_non_ascii_signature_header_is_401_not_500(self):
        body = sample_payload()
        res = client.post(
            "/webhooks/jobber",
            content=body,
            headers=[
                (b"content-type", b"application/json"),
                (b"x-jobber-hmac-sha256", "sïgnature".encode("utf-8")),
            ],
        )
        assert res.status_code == 401

    def test_signed_non_json_body(self):
        body = b"not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_missing_web_hook_event(self):
        body = json.dumps({"data": {}}).encode()
        assert post(body, sign(body)).status_code == 400
