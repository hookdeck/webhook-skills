import os
import base64
import pytest
from fastapi.testclient import TestClient

# Set test environment variables
os.environ["CHARGEBEE_WEBHOOK_USERNAME"] = "test_webhook_user"
os.environ["CHARGEBEE_WEBHOOK_PASSWORD"] = "test_webhook_pass"

from main import app

client = TestClient(app)


def create_basic_auth_header(username: str, password: str) -> str:
    """Helper function to create Basic Auth header"""
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"


# Sample webhook payload
sample_webhook_payload = {
    "id": "ev_test_16BHbhF4s42tO2lK",
    "occurred_at": 1704067200,
    "source": "admin_console",
    "object": "event",
    "api_version": "v2",
    "event_type": "subscription_created",
    "content": {
        "subscription": {
            "id": "16BHbhF4s42tO2lJ",
            "customer_id": "16BHbhF4s42tO2lI",
            "plan_id": "basic-monthly",
            "status": "active",
            "current_term_start": 1704067200,
            "current_term_end": 1706745600,
            "created_at": 1704067200
        },
        "customer": {
            "id": "16BHbhF4s42tO2lI",
            "email": "test@example.com",
            "first_name": "Test",
            "last_name": "User"
        }
    }
}


class TestChargebeeWebhook:
    """Test cases for Chargebee webhook handler"""

    def test_webhook_with_valid_auth(self):
        """Test webhook with valid Basic Auth credentials"""
        response = client.post(
            "/webhooks/chargebee",
            json=sample_webhook_payload,
            headers={
                "Authorization": create_basic_auth_header("test_webhook_user", "test_webhook_pass")
            }
        )
        assert response.status_code == 200
        assert response.json() == {"status": "OK"}

    def test_webhook_without_auth_header(self):
        """Test webhook without Authorization header"""
        response = client.post(
            "/webhooks/chargebee",
            json=sample_webhook_payload
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Unauthorized"

    def test_webhook_with_invalid_credentials(self):
        """Test webhook with invalid credentials"""
        response = client.post(
            "/webhooks/chargebee",
            json=sample_webhook_payload,
            headers={
                "Authorization": create_basic_auth_header("wrong_user", "wrong_pass")
            }
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"

    def test_webhook_with_malformed_auth_header(self):
        """Test webhook with malformed Authorization header"""
        response = client.post(
            "/webhooks/chargebee",
            json=sample_webhook_payload,
            headers={
                "Authorization": "Bearer token123"
            }
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Unauthorized"

    def test_webhook_with_invalid_base64(self):
        """Test webhook with invalid Base64 in Authorization header"""
        response = client.post(
            "/webhooks/chargebee",
            json=sample_webhook_payload,
            headers={
                "Authorization": "Basic invalid_base64!"
            }
        )
        assert response.status_code == 401

    def test_webhook_with_password_containing_colons(self):
        """Test webhook with password containing colons"""
        # Temporarily change the expected password
        original_password = os.environ["CHARGEBEE_WEBHOOK_PASSWORD"]
        os.environ["CHARGEBEE_WEBHOOK_PASSWORD"] = "pass:with:colons"

        response = client.post(
            "/webhooks/chargebee",
            json=sample_webhook_payload,
            headers={
                "Authorization": create_basic_auth_header("test_webhook_user", "pass:with:colons")
            }
        )
        assert response.status_code == 200
        assert response.json() == {"status": "OK"}

        # Restore original password
        os.environ["CHARGEBEE_WEBHOOK_PASSWORD"] = original_password

    def test_different_event_types(self):
        """Test handling of different event types"""
        event_types = [
            "subscription_created",
            "subscription_changed",
            "subscription_cancelled",
            "subscription_reactivated",
            "payment_succeeded",
            "payment_failed",
            "invoice_generated",
            "customer_created",
            "unknown_event_type"
        ]

        for event_type in event_types:
            payload = {
                **sample_webhook_payload,
                "event_type": event_type
            }

            response = client.post(
                "/webhooks/chargebee",
                json=payload,
                headers={
                    "Authorization": create_basic_auth_header("test_webhook_user", "test_webhook_pass")
                }
            )
            assert response.status_code == 200
            assert response.json() == {"status": "OK"}

    def test_webhook_with_missing_content(self):
        """Test webhook with missing content field"""
        payload = {
            "id": "ev_test_minimal",
            "event_type": "subscription_created",
            "occurred_at": 1704067200
        }

        response = client.post(
            "/webhooks/chargebee",
            json=payload,
            headers={
                "Authorization": create_basic_auth_header("test_webhook_user", "test_webhook_pass")
            }
        )
        assert response.status_code == 200
        assert response.json() == {"status": "OK"}

    def test_webhook_with_invalid_json(self):
        """Test webhook with invalid JSON payload"""
        response = client.post(
            "/webhooks/chargebee",
            data="invalid json",
            headers={
                "Authorization": create_basic_auth_header("test_webhook_user", "test_webhook_pass"),
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 422

    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}

    def test_root_endpoint(self):
        """Test root endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {
            "service": "Chargebee Webhook Handler",
            "webhook_endpoint": "/webhooks/chargebee",
            "docs": "/docs"
        }