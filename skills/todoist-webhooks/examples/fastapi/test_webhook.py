import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_client_secret"
os.environ["TODOIST_CLIENT_SECRET"] = SECRET

from main import app, seen_deliveries, verify_todoist_webhook  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Todoist: base64(HMAC-SHA256(client_secret, raw body))."""
    return base64.b64encode(hmac.new(secret.encode(), payload, hashlib.sha256).digest()).decode()


def event(name: str) -> bytes:
    return json.dumps({
        "event_name": name,
        "user_id": "2671355",
        "event_data": {"id": "6XR4GqQQCW6Gv9h4", "content": "Buy Milk"},
        "initiator": {"id": "2671355", "email": "alice@example.com", "full_name": "Alice"},
        "triggered_at": "2025-02-10T10:39:38.000000Z",
        "version": "10",
    }).encode()


@pytest.fixture(autouse=True)
def clear_seen():
    seen_deliveries.clear()


class TestVerify:
    def test_valid(self):
        body = event("item:added")
        assert verify_todoist_webhook(body, sign(body), SECRET)

    def test_invalid_cases(self):
        body = event("item:added")
        assert not verify_todoist_webhook(body, "bad", SECRET)
        assert not verify_todoist_webhook(body, sign(body, "other"), SECRET)
        assert not verify_todoist_webhook(event("item:deleted"), sign(body), SECRET)
        assert not verify_todoist_webhook(body, None, SECRET)


class TestEndpoint:
    @pytest.mark.parametrize("name", ["item:added", "item:completed", "note:added", "project:added"])
    def test_signed_event_returns_200(self, name):
        body = event(name)
        r = client.post(
            "/webhooks/todoist",
            content=body,
            headers={"Content-Type": "application/json", "X-Todoist-Hmac-SHA256": sign(body),
                     "X-Todoist-Delivery-ID": f"d-{name}"},
        )
        assert r.status_code == 200

    def test_any_content_type_verifies(self):
        body = event("item:added")
        r = client.post("/webhooks/todoist", content=body,
                        headers={"Content-Type": "text/plain", "X-Todoist-Hmac-SHA256": sign(body)})
        assert r.status_code == 200

    def test_missing_signature(self):
        r = client.post("/webhooks/todoist", content=event("item:added"),
                        headers={"Content-Type": "application/json"})
        assert r.status_code == 400

    def test_invalid_signature(self):
        r = client.post("/webhooks/todoist", content=event("item:added"),
                        headers={"X-Todoist-Hmac-SHA256": "invalid"})
        assert r.status_code == 400

    def test_signed_non_json_body(self):
        body = b"not json"
        r = client.post("/webhooks/todoist", content=body, headers={"X-Todoist-Hmac-SHA256": sign(body)})
        assert r.status_code == 400

    def test_retried_delivery_is_duplicate(self):
        body = event("item:added")
        headers = {"X-Todoist-Hmac-SHA256": sign(body), "X-Todoist-Delivery-ID": "dup-1"}
        assert client.post("/webhooks/todoist", content=body, headers=headers).json() == {"received": True}
        second = client.post("/webhooks/todoist", content=body, headers=headers)
        assert second.status_code == 200
        assert second.json()["duplicate"] is True

    def test_unhandled_event_returns_200(self):
        body = event("label:added")
        r = client.post("/webhooks/todoist", content=body, headers={"X-Todoist-Hmac-SHA256": sign(body)})
        assert r.status_code == 200
