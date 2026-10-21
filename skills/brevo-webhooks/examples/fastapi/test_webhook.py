import base64
import os

import pytest
from fastapi.testclient import TestClient

USER = "brevo_user"
PASS = "test_pass:with:colons"
TOKEN = "test_bearer_token_123"

# Set test environment variables before importing the app
os.environ["BREVO_WEBHOOK_USERNAME"] = USER
os.environ["BREVO_WEBHOOK_PASSWORD"] = PASS
os.environ["BREVO_WEBHOOK_TOKEN"] = TOKEN

from main import app, verify_brevo_auth  # noqa: E402

client = TestClient(app)

DELIVERED_EVENT = {
    "event": "delivered",
    "email": "example@domain.com",
    "id": 26224,
    "date": "2020-10-09 00:00:00",
    "ts": 1604933619,
    "message-id": "201798300811.5787683@relay.domain.com",
    "ts_event": 1604933654,
    "subject": "My first Transactional",
    "tags": ["transac_messages"],
}


def basic_auth(username: str, password: str) -> str:
    """Brevo sends URL-embedded credentials as a standard Basic auth header."""
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("utf-8")
    return f"Basic {token}"


@pytest.fixture(autouse=True)
def restore_env():
    yield
    os.environ["BREVO_WEBHOOK_USERNAME"] = USER
    os.environ["BREVO_WEBHOOK_PASSWORD"] = PASS
    os.environ["BREVO_WEBHOOK_TOKEN"] = TOKEN


class TestVerifyBrevoAuth:
    def test_valid_basic(self):
        assert verify_brevo_auth(basic_auth(USER, PASS), USER, PASS, TOKEN) is True

    def test_valid_bearer(self):
        assert verify_brevo_auth(f"Bearer {TOKEN}", USER, PASS, TOKEN) is True

    def test_wrong_credentials(self):
        assert verify_brevo_auth(basic_auth(USER, "nope"), USER, PASS, TOKEN) is False
        assert verify_brevo_auth(basic_auth("someone", PASS), USER, PASS, TOKEN) is False
        assert verify_brevo_auth("Bearer wrong", USER, PASS, TOKEN) is False

    def test_missing_header(self):
        assert verify_brevo_auth(None, USER, PASS, TOKEN) is False

    def test_malformed_basic(self):
        assert verify_brevo_auth("Basic !!!not-base64", USER, PASS, TOKEN) is False

    def test_only_configured_methods(self):
        assert verify_brevo_auth(basic_auth(USER, PASS), token=TOKEN) is False
        assert verify_brevo_auth(f"Bearer {TOKEN}", USER, PASS) is False

    def test_password_with_colons(self):
        # PASS contains colons — must split on the FIRST colon only
        assert verify_brevo_auth(basic_auth(USER, PASS), USER, PASS) is True


class TestBrevoWebhook:
    def test_missing_auth_returns_401(self):
        response = client.post("/webhooks/brevo", json=DELIVERED_EVENT)
        assert response.status_code == 401

    def test_invalid_credentials_return_401(self):
        for header in (basic_auth(USER, "wrong"), "Bearer wrong"):
            response = client.post(
                "/webhooks/brevo", json=DELIVERED_EVENT, headers={"Authorization": header}
            )
            assert response.status_code == 401

    def test_valid_basic_returns_200(self):
        response = client.post(
            "/webhooks/brevo",
            json=DELIVERED_EVENT,
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_bearer_returns_200(self):
        response = client.post(
            "/webhooks/brevo",
            json=DELIVERED_EVENT,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 200

    def test_no_credentials_configured_returns_500(self):
        for key in ("BREVO_WEBHOOK_USERNAME", "BREVO_WEBHOOK_PASSWORD", "BREVO_WEBHOOK_TOKEN"):
            os.environ.pop(key, None)
        response = client.post(
            "/webhooks/brevo",
            json=DELIVERED_EVENT,
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 500

    def test_batched_events(self):
        response = client.post(
            "/webhooks/brevo",
            json=[DELIVERED_EVENT, {**DELIVERED_EVENT, "event": "opened"}],
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200

    def test_invalid_payload(self):
        response = client.post(
            "/webhooks/brevo",
            content=b"{not json",
            headers={"Authorization": basic_auth(USER, PASS), "Content-Type": "application/json"},
        )
        assert response.status_code in (400, 422)

    @pytest.mark.parametrize(
        "event_type",
        [
            "request", "delivered", "opened", "unique_opened", "click", "soft_bounce",
            "hard_bounce", "spam", "unsubscribed", "blocked", "invalid_email", "deferred",
            "error", "proxy_open", "unique_proxy_open", "unsubscribe", "list_addition",
            "contact_updated", "contact_deleted", "some_future_event",
        ],
    )
    def test_handles_event_types(self, event_type):
        response = client.post(
            "/webhooks/brevo",
            json={**DELIVERED_EVENT, "event": event_type},
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200, f"Failed for event: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
