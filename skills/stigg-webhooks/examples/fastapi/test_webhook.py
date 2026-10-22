import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_stigg_webhook_secret_123"
HEADER = "Stigg-Webhooks-Secret"

# Set test environment variables before importing the app
os.environ["STIGG_WEBHOOK_SECRET"] = SECRET

from main import app, verify_stigg_secret  # noqa: E402

client = TestClient(app)

SUBSCRIPTION_CREATED = {
    "type": "subscription.created",
    "messageId": "a6ce1f4e-0000-4000-8000-000000000001",
    "traceId": "549a1f4e-0000-4000-8000-000000000002",
    "entityId": "customer-uuid",
    "id": "subscription-id",
    "status": "ACTIVE",
    "customer": {"id": "customer-test-id", "email": "john@example.com"},
    "plan": {"id": "plan-test-id", "name": "plan-test-name", "pricingType": "PAID"},
}


@pytest.fixture(autouse=True)
def restore_env():
    os.environ["STIGG_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["STIGG_WEBHOOK_SECRET"] = SECRET


class TestVerifyStiggSecret:
    def test_accepts_matching_secret(self):
        assert verify_stigg_secret(SECRET, SECRET) is True

    def test_rejects_wrong_secret(self):
        assert verify_stigg_secret("wrong", SECRET) is False

    def test_rejects_secret_of_different_length(self):
        assert verify_stigg_secret(SECRET + "x", SECRET) is False

    def test_rejects_missing_header(self):
        assert verify_stigg_secret(None, SECRET) is False

    def test_rejects_when_no_secret_configured(self):
        assert verify_stigg_secret(SECRET, None) is False


class TestWebhookEndpoint:
    def test_401_when_header_missing(self):
        res = client.post("/webhooks/stigg", json=SUBSCRIPTION_CREATED)
        assert res.status_code == 401

    def test_401_for_wrong_secret(self):
        res = client.post("/webhooks/stigg", json=SUBSCRIPTION_CREATED, headers={HEADER: "wrong"})
        assert res.status_code == 401

    def test_200_for_valid_secret(self):
        res = client.post("/webhooks/stigg", json=SUBSCRIPTION_CREATED, headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        res = client.post(
            "/webhooks/stigg",
            content=json.dumps(SUBSCRIPTION_CREATED),
            headers={HEADER: SECRET, "Content-Type": "text/plain"},
        )
        assert res.status_code == 200

    def test_500_when_secret_not_configured(self):
        del os.environ["STIGG_WEBHOOK_SECRET"]
        res = client.post("/webhooks/stigg", json=SUBSCRIPTION_CREATED, headers={HEADER: SECRET})
        assert res.status_code == 500

    def test_400_for_invalid_json(self):
        res = client.post(
            "/webhooks/stigg",
            content="{not json",
            headers={HEADER: SECRET, "Content-Type": "application/json"},
        )
        assert res.status_code == 400

    def test_400_when_type_missing(self):
        res = client.post("/webhooks/stigg", json={"messageId": "x"}, headers={HEADER: SECRET})
        assert res.status_code == 400

    @pytest.mark.parametrize(
        "event_type",
        [
            "customer.created", "customer.updated", "customer.deleted", "customer.payment_failed",
            "subscription.created", "subscription.updated", "subscription.canceled",
            "subscription.expired", "subscription.trial_started", "subscription.trial_converted",
            "subscription.trial_expired", "subscription.trial.ends_soon",
            "entitlements.updated", "entitlement.usage_exceeded", "some.future_event",
        ],
    )
    def test_handles_events(self, event_type):
        res = client.post(
            "/webhooks/stigg",
            json={**SUBSCRIPTION_CREATED, "type": event_type},
            headers={HEADER: SECRET},
        )
        assert res.status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
