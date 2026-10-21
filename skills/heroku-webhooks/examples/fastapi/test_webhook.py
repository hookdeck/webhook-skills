import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["HEROKU_WEBHOOK_SECRET"] = "test_heroku_secret"
os.environ.pop("HEROKU_WEBHOOK_AUTHORIZATION", None)

from main import app, verify_heroku_webhook

client = TestClient(app)
SECRET = os.environ["HEROKU_WEBHOOK_SECRET"]


def sign(payload: str, secret: str = SECRET) -> str:
    """Heroku's algorithm: base64(HMAC-SHA256(secret, raw body))."""
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


def make_event(resource: str, action: str, data: dict = None) -> str:
    return json.dumps({
        "id": "d472a8bb-1a3c-4f78-aad1-995e6d0022ec",
        "action": action,
        "resource": resource,
        "data": data or {},
        "previous_data": {},
        "created_at": "2016-10-26T22:50:14Z",
    })


def post(body: str, **headers):
    return client.post(
        "/webhooks/heroku",
        content=body,
        headers={"Content-Type": "application/json", **headers},
    )


class TestVerify:
    def test_valid_signature(self):
        assert verify_heroku_webhook(b'{"id":"1"}', sign('{"id":"1"}'), SECRET) is True

    def test_invalid_signature(self):
        assert verify_heroku_webhook(b"{}", "invalid", SECRET) is False

    def test_missing_header(self):
        assert verify_heroku_webhook(b"{}", None, SECRET) is False

    def test_wrong_secret(self):
        assert verify_heroku_webhook(b"{}", sign("{}", "other"), SECRET) is False


class TestWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        assert post(make_event("release", "create")).status_code == 400

    def test_invalid_signature_returns_400(self):
        resp = post(make_event("release", "create"), **{"Heroku-Webhook-Hmac-SHA256": "invalid"})
        assert resp.status_code == 400

    def test_tampered_body_returns_400(self):
        signed = make_event("release", "create", {"version": 1})
        resp = post(
            make_event("release", "create", {"version": 2}),
            **{"Heroku-Webhook-Hmac-SHA256": sign(signed)},
        )
        assert resp.status_code == 400

    def test_valid_signature_returns_204(self):
        body = make_event("release", "create", {"version": 12, "status": "succeeded"})
        resp = post(body, **{"Heroku-Webhook-Hmac-SHA256": sign(body)})
        assert resp.status_code == 204

    @pytest.mark.parametrize("resource,action", [
        ("api:release", "create"),
        ("api:release", "update"),
        ("api:build", "create"),
        ("api:build", "update"),
        ("api:app", "update"),
        ("api:dyno", "create"),
        ("api:formation", "update"),
        ("api:formation", "destroy"),
        ("api:addon-attachment", "create"),
        ("api:addon-attachment", "destroy"),
        ("api:domain", "create"),
    ])
    def test_documented_events(self, resource, action):
        body = make_event(resource, action)
        resp = post(body, **{"Heroku-Webhook-Hmac-SHA256": sign(body)})
        assert resp.status_code == 204

    def test_signed_non_json_returns_400(self):
        body = "not json"
        resp = post(body, **{"Heroku-Webhook-Hmac-SHA256": sign(body)})
        assert resp.status_code == 400

    def test_authorization_mismatch_returns_401(self, monkeypatch):
        monkeypatch.setenv("HEROKU_WEBHOOK_AUTHORIZATION", "Bearer abc123")
        body = make_event("build", "update")
        resp = post(body, **{"Heroku-Webhook-Hmac-SHA256": sign(body), "Authorization": "Bearer wrong"})
        assert resp.status_code == 401

    def test_authorization_match_returns_204(self, monkeypatch):
        monkeypatch.setenv("HEROKU_WEBHOOK_AUTHORIZATION", "Bearer abc123")
        body = make_event("build", "update")
        resp = post(body, **{"Heroku-Webhook-Hmac-SHA256": sign(body), "Authorization": "Bearer abc123"})
        assert resp.status_code == 204


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
