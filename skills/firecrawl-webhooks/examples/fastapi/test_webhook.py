import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_firecrawl_secret"
os.environ["FIRECRAWL_WEBHOOK_SECRET"] = SECRET

from main import app, verify_firecrawl_webhook  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def payload(event_type: str) -> bytes:
    return json.dumps(
        {"success": True, "type": event_type, "id": "job-1", "webhookId": "wh-1", "data": [], "metadata": {}}
    ).encode()


class TestVerify:
    body = payload("crawl.started")

    def test_valid(self):
        assert verify_firecrawl_webhook(self.body, sign(self.body), SECRET) is True

    def test_wrong_secret(self):
        assert verify_firecrawl_webhook(self.body, sign(self.body, "other"), SECRET) is False

    def test_tampered_body(self):
        assert verify_firecrawl_webhook(payload("crawl.completed"), sign(self.body), SECRET) is False

    @pytest.mark.parametrize("header", ["garbage", "sha1=abc", "sha256=", "", None])
    def test_malformed_header(self, header):
        assert verify_firecrawl_webhook(self.body, header, SECRET) is False


class TestEndpoint:
    @pytest.mark.parametrize(
        "event_type",
        [
            "crawl.started", "crawl.page", "crawl.completed",
            "batch_scrape.started", "batch_scrape.page", "batch_scrape.completed",
            "extract.started", "extract.completed", "extract.failed",
            "agent.completed", "monitor.check.completed",
        ],
    )
    def test_signed_events_accepted(self, event_type):
        body = payload(event_type)
        r = client.post("/webhooks/firecrawl", content=body, headers={"X-Firecrawl-Signature": sign(body)})
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_any_content_type_verifies(self):
        body = payload("crawl.page")
        r = client.post(
            "/webhooks/firecrawl",
            content=body,
            headers={"X-Firecrawl-Signature": sign(body), "Content-Type": "text/plain"},
        )
        assert r.status_code == 200

    def test_unknown_event_acknowledged(self):
        body = payload("something.else")
        r = client.post("/webhooks/firecrawl", content=body, headers={"X-Firecrawl-Signature": sign(body)})
        assert r.status_code == 200

    def test_invalid_signature(self):
        body = payload("crawl.page")
        r = client.post("/webhooks/firecrawl", content=body, headers={"X-Firecrawl-Signature": sign(body, "wrong")})
        assert r.status_code == 400

    def test_missing_signature(self):
        r = client.post("/webhooks/firecrawl", content=payload("crawl.page"))
        assert r.status_code == 400

    def test_signed_invalid_json(self):
        body = b"not json"
        r = client.post("/webhooks/firecrawl", content=body, headers={"X-Firecrawl-Signature": sign(body)})
        assert r.status_code == 400
