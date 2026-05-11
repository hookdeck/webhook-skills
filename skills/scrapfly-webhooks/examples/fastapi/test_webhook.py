import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["SCRAPFLY_WEBHOOK_SECRET"] = "test_scrapfly_signing_secret"

from main import app  # noqa: E402  (imports after setting env vars)


def generate_scrapfly_signature(raw_body: bytes, secret: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest().upper()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def secret():
    return os.environ["SCRAPFLY_WEBHOOK_SECRET"]


class TestScrapflyWebhook:
    def test_missing_signature(self, client):
        response = client.post(
            "/webhooks/scrapfly",
            content=b"{}",
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Resource-Type": "scrape",
            },
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid signature"

    def test_invalid_signature(self, client):
        body = json.dumps({"result": {"status_code": 200}}).encode("utf-8")
        response = client.post(
            "/webhooks/scrapfly",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Signature": "DEADBEEF",
                "X-Scrapfly-Webhook-Resource-Type": "scrape",
            },
        )
        assert response.status_code == 401

    def test_tampered_body(self, client, secret):
        original = json.dumps({"result": {"status_code": 200}}).encode("utf-8")
        sig = generate_scrapfly_signature(original, secret)

        tampered = json.dumps({"result": {"status_code": 500}}).encode("utf-8")
        response = client.post(
            "/webhooks/scrapfly",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Signature": sig,
                "X-Scrapfly-Webhook-Resource-Type": "scrape",
            },
        )
        assert response.status_code == 401

    def test_valid_scrape_webhook(self, client, secret):
        body = json.dumps(
            {
                "result": {
                    "url": "https://web-scraping.dev/products",
                    "status_code": 200,
                    "content": "<html></html>",
                },
                "context": {
                    "webhook": {
                        "name": "my-webhook",
                        "secret": secret,
                        "consecutive_failed_count": 0,
                    },
                    "job": {"uuid": "550e8400-e29b-41d4-a716-446655440000"},
                },
            }
        ).encode("utf-8")
        sig = generate_scrapfly_signature(body, secret)

        response = client.post(
            "/webhooks/scrapfly",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Signature": sig,
                "X-Scrapfly-Webhook-Resource-Type": "scrape",
                "X-Scrapfly-Webhook-Id": "wh_test_1",
                "X-Scrapfly-Webhook-Job-Id": "job_test_1",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    @pytest.mark.parametrize(
        "resource_type",
        ["scrape", "extraction", "screenshot"],
    )
    def test_resource_types(self, client, secret, resource_type):
        body = json.dumps({"result": {"status_code": 200}}).encode("utf-8")
        sig = generate_scrapfly_signature(body, secret)

        response = client.post(
            "/webhooks/scrapfly",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Signature": sig,
                "X-Scrapfly-Webhook-Resource-Type": resource_type,
            },
        )
        assert response.status_code == 200

    @pytest.mark.parametrize(
        "event",
        [
            "crawler_started",
            "crawler_url_visited",
            "crawler_url_discovered",
            "crawler_url_skipped",
            "crawler_url_failed",
            "crawler_stopped",
            "crawler_cancelled",
            "crawler_finished",
        ],
    )
    def test_crawler_events(self, client, secret, event):
        body = json.dumps(
            {
                "event": event,
                "payload": {
                    "crawler_uuid": "550e8400-e29b-41d4-a716-446655440000",
                    "url": "https://web-scraping.dev/page",
                },
            }
        ).encode("utf-8")
        sig = generate_scrapfly_signature(body, secret)

        response = client.post(
            "/webhooks/scrapfly",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Signature": sig,
                "X-Scrapfly-Crawl-Event-Name": event,
            },
        )
        assert response.status_code == 200

    def test_lowercase_signature_variant(self, client, secret):
        # Scrapfly also sends X-Scrapfly-Webhook-Signature-Lowercase; the handler
        # accepts either casing.
        body = json.dumps({"result": {"status_code": 200}}).encode("utf-8")
        sig = generate_scrapfly_signature(body, secret).lower()

        response = client.post(
            "/webhooks/scrapfly",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Signature": sig,
                "X-Scrapfly-Webhook-Resource-Type": "scrape",
            },
        )
        assert response.status_code == 200

    def test_invalid_json_body(self, client, secret):
        malformed = b"{ not json"
        sig = generate_scrapfly_signature(malformed, secret)

        response = client.post(
            "/webhooks/scrapfly",
            content=malformed,
            headers={
                "Content-Type": "application/json",
                "X-Scrapfly-Webhook-Signature": sig,
                "X-Scrapfly-Webhook-Resource-Type": "scrape",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON payload"

    def test_missing_secret(self, client):
        original = os.environ.pop("SCRAPFLY_WEBHOOK_SECRET", None)
        try:
            response = client.post(
                "/webhooks/scrapfly",
                content=b"{}",
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 500
            assert response.json()["detail"] == "Webhook secret not configured"
        finally:
            if original is not None:
                os.environ["SCRAPFLY_WEBHOOK_SECRET"] = original


class TestHealth:
    def test_health(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
