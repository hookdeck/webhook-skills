import os
import json
import hmac
import hashlib
from fastapi.testclient import TestClient

# TheirStack signing secrets are any string of 16+ characters
SECRET = "test_theirstack_signing_secret"
os.environ["THEIRSTACK_WEBHOOK_SECRET"] = SECRET

from main import app, verify_theirstack_webhook

client = TestClient(app)

HEADER = "X-TheirStack-Signature-256"


def sign(payload: str, secret: str = SECRET) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


class TestVerifyTheirStackWebhook:
    # Test vector from TheirStack's "Verify webhook signatures" docs
    doc_secret = "It's a Secret to Everybody"
    doc_payload = b"Hello, World!"
    doc_signature = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17"

    def test_reproduces_documented_test_vector(self):
        assert sign(self.doc_payload.decode(), self.doc_secret) == self.doc_signature
        assert verify_theirstack_webhook(self.doc_payload, self.doc_signature, self.doc_secret)

    def test_accepts_uppercase_hex(self):
        header = "sha256=" + self.doc_signature[7:].upper()
        assert verify_theirstack_webhook(self.doc_payload, header, self.doc_secret)

    def test_rejects_missing_header(self):
        assert not verify_theirstack_webhook(self.doc_payload, None, self.doc_secret)
        assert not verify_theirstack_webhook(self.doc_payload, "", self.doc_secret)

    def test_rejects_missing_prefix(self):
        assert not verify_theirstack_webhook(self.doc_payload, self.doc_signature[7:], self.doc_secret)

    def test_rejects_wrong_secret(self):
        assert not verify_theirstack_webhook(self.doc_payload, self.doc_signature, "another secret value")

    def test_rejects_tampered_body(self):
        assert not verify_theirstack_webhook(b"Hello, World?", self.doc_signature, self.doc_secret)

    def test_rejects_truncated_signature(self):
        assert not verify_theirstack_webhook(self.doc_payload, self.doc_signature[:-2], self.doc_secret)

    def test_non_ascii_header_returns_false_not_error(self):
        assert not verify_theirstack_webhook(self.doc_payload, "sha256=é" + "a" * 63, self.doc_secret)

    def test_rejects_missing_secret(self):
        assert not verify_theirstack_webhook(self.doc_payload, self.doc_signature, None)


class TestWebhookEndpoint:
    events = {
        "job.new": {"id": 1, "type": "job.new", "payload": {"id": 123, "job_title": "Senior Data Engineer", "company_domain": "acme.com"}},
        "company.new": {"id": 2, "type": "company.new", "payload": {"name": "Acme", "domain": "acme.com"}},
        "job.closed": {"id": 3, "type": "job.closed", "payload": {"id": 123, "closed_at": "2026-06-08T14:00:00Z"}},
        "tech.new": {"id": 4, "type": "tech.new", "payload": {"name": "Acme"}},
    }

    def post(self, raw: str, headers: dict | None = None, content_type: str = "application/json"):
        return client.post(
            "/webhooks/theirstack",
            content=raw.encode("utf-8"),
            headers={"Content-Type": content_type, **(headers or {})},
        )

    def test_accepts_signed_events(self):
        for name, body in self.events.items():
            raw = json.dumps(body)
            response = self.post(raw, {HEADER: sign(raw)})
            assert response.status_code == 200, name

    def test_verifies_regardless_of_content_type(self):
        raw = json.dumps(self.events["job.new"])
        response = self.post(raw, {HEADER: sign(raw)}, content_type="text/plain")
        assert response.status_code == 200

    def test_401_when_header_missing(self):
        response = self.post(json.dumps(self.events["job.new"]))
        assert response.status_code == 401

    def test_401_for_wrong_signature(self):
        raw = json.dumps(self.events["job.new"])
        response = self.post(raw, {HEADER: sign(raw, "a different secret value")})
        assert response.status_code == 401

    def test_401_for_non_ascii_header(self):
        raw = json.dumps(self.events["job.new"])
        response = client.post(
            "/webhooks/theirstack",
            content=raw.encode("utf-8"),
            headers={"Content-Type": "application/json", HEADER: "sha256=é".encode("utf-8")},
        )
        assert response.status_code == 401

    def test_400_for_signed_non_json(self):
        raw = "not json"
        response = self.post(raw, {HEADER: sign(raw)}, content_type="text/plain")
        assert response.status_code == 400

    def test_acknowledges_unknown_event_types(self):
        raw = json.dumps({"id": 9, "type": "something.else", "payload": {}})
        response = self.post(raw, {HEADER: sign(raw)})
        assert response.status_code == 200
