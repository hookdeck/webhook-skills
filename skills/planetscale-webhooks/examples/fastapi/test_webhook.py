import os
import json
import hmac
import hashlib
import pytest
from fastapi.testclient import TestClient

os.environ["PLANETSCALE_WEBHOOK_SECRET"] = "test_planetscale_secret"

from main import app, verify_planetscale_webhook

client = TestClient(app)
SECRET = os.environ["PLANETSCALE_WEBHOOK_SECRET"]


def generate_planetscale_signature(payload: bytes, secret: str) -> str:
    """Generate a valid PlanetScale signature for testing: bare hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def envelope(event: str, resource) -> dict:
    """Shapes follow PlanetScale's documented example payloads (resources trimmed)."""
    return {
        "timestamp": 1698252879,
        "event": event,
        "organization": "myorg",
        "database": "example_database",
        "resource": resource,
    }


BRANCH = {"id": "ecrmjy2f4a5o", "type": "Branch", "name": "dev", "state": "ready",
          "html_url": "https://app.planetscale.com/demo-db/example_database/dev"}
DEPLOY_REQUEST = {"id": "4xsz0ql82y4n", "type": "DeployRequest", "number": 5, "branch": "dev",
                  "into_branch": "main", "state": "open", "deployment_state": "pending"}


def post(body: bytes, headers=None):
    return client.post(
        "/webhooks/planetscale",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


def post_signed(body: bytes, secret: str = SECRET):
    return post(body, {"x-planetscale-signature": generate_planetscale_signature(body, secret)})


class TestVerifyPlanetScaleWebhook:
    payload = b'{"event":"webhook.test"}'

    def test_valid_signature_returns_true(self):
        sig = generate_planetscale_signature(self.payload, SECRET)
        assert verify_planetscale_webhook(self.payload, sig, SECRET) is True

    def test_uppercase_hex_is_accepted(self):
        sig = generate_planetscale_signature(self.payload, SECRET).upper()
        assert verify_planetscale_webhook(self.payload, sig, SECRET) is True

    def test_missing_or_empty_header_or_secret(self):
        sig = generate_planetscale_signature(self.payload, SECRET)
        assert verify_planetscale_webhook(self.payload, None, SECRET) is False
        assert verify_planetscale_webhook(self.payload, "", SECRET) is False
        assert verify_planetscale_webhook(self.payload, sig, None) is False

    def test_prefixed_value_is_rejected(self):
        sig = generate_planetscale_signature(self.payload, SECRET)
        assert verify_planetscale_webhook(self.payload, f"sha256={sig}", SECRET) is False

    def test_wrong_length_and_non_hex_are_rejected(self):
        sig = generate_planetscale_signature(self.payload, SECRET)
        assert verify_planetscale_webhook(self.payload, sig[:62], SECRET) is False
        assert verify_planetscale_webhook(self.payload, sig + "00", SECRET) is False
        assert verify_planetscale_webhook(self.payload, "zz" + sig[2:], SECRET) is False
        assert verify_planetscale_webhook(self.payload, sig + "\n", SECRET) is False

    def test_non_ascii_header_returns_false_not_error(self):
        assert verify_planetscale_webhook(self.payload, "é" * 64, SECRET) is False

    def test_wrong_secret_or_body_is_rejected(self):
        sig = generate_planetscale_signature(self.payload, "other")
        assert verify_planetscale_webhook(self.payload, sig, SECRET) is False
        good = generate_planetscale_signature(self.payload, SECRET)
        assert verify_planetscale_webhook(b'{"event":"x"}', good, SECRET) is False


class TestWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        assert post(json.dumps(envelope("branch.ready", BRANCH)).encode()).status_code == 401

    def test_invalid_signature_returns_401(self):
        body = json.dumps(envelope("branch.ready", BRANCH)).encode()
        assert post(body, {"x-planetscale-signature": "a" * 64}).status_code == 401

    def test_malformed_signature_returns_401(self):
        body = json.dumps(envelope("branch.ready", BRANCH)).encode()
        assert post(body, {"x-planetscale-signature": "not-hex"}).status_code == 401

    def test_wrong_secret_returns_401(self):
        body = json.dumps(envelope("branch.ready", BRANCH)).encode()
        assert post_signed(body, "wrong_secret").status_code == 401

    def test_tampered_body_returns_401(self):
        body = json.dumps(envelope("branch.ready", BRANCH)).encode()
        sig = generate_planetscale_signature(body, SECRET)
        assert post(body.replace(b"dev", b"main"), {"x-planetscale-signature": sig}).status_code == 401

    def test_verifies_exact_bytes_not_reserialization(self):
        # Signed over the pretty-printed bytes: json.dumps(json.loads(body)) would differ
        body = json.dumps(envelope("branch.ready", BRANCH), indent=2).encode()
        assert post_signed(body).status_code == 200

    def test_verifies_any_content_type(self):
        body = json.dumps(envelope("branch.ready", BRANCH)).encode()
        response = client.post(
            "/webhooks/planetscale",
            content=body,
            headers={"content-type": "text/plain", "x-planetscale-signature": generate_planetscale_signature(body, SECRET)},
        )
        assert response.status_code == 200

    @pytest.mark.parametrize("event,resource", [
        ("webhook.test", {"id": "34rbgzmvgb9m", "type": "Database", "name": "example_database"}),
        ("branch.ready", BRANCH),
        ("branch.anomaly", BRANCH),
        ("deploy_request.opened", DEPLOY_REQUEST),
        ("deploy_request.queued", DEPLOY_REQUEST),
        ("deploy_request.in_progress", DEPLOY_REQUEST),
        ("backup.failed", {"id": "k2n8pqw4x1yz", "type": "Backup", "name": "2026.08.27 15:04:05.123", "state": "failed"}),
        ("backup.succeeded", {"id": "b4ckup98wxyz", "type": "Backup", "name": "2026.08.27 03:00:00.000", "state": "success"}),
        ("cluster.storage", {"branch_name": "main", "storage_percentage": 44, "storage": [{"storage_percentage": 44.1}]}),
        ("database.access_request", {"id": "23wl4nynt06x", "type": "PlanetScaleAdminAccessRequest", "state": "pending"}),
    ])
    def test_signed_events_return_200(self, event, resource):
        response = post_signed(json.dumps(envelope(event, resource)).encode())
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_unhandled_and_unknown_events_return_200(self):
        assert post_signed(json.dumps(envelope("deploy_request.closed", DEPLOY_REQUEST)).encode()).status_code == 200
        assert post_signed(json.dumps(envelope("something.new", {})).encode()).status_code == 200

    def test_wrong_typed_fields_are_ignored(self):
        assert post_signed(json.dumps({"event": 42, "resource": "nope", "database": ["x"]}).encode()).status_code == 200
        assert post_signed(json.dumps({"event": "deploy_request.opened", "resource": [1, 2]}).encode()).status_code == 200
        assert post_signed(json.dumps({"event": "cluster.storage", "resource": {"storage": "x"}}).encode()).status_code == 200

    def test_signed_non_json_returns_400(self):
        assert post_signed(b"not json").status_code == 400

    @pytest.mark.parametrize("body", [b"[1,2]", b"null", b'"str"'])
    def test_signed_non_object_json_returns_400(self, body):
        assert post_signed(body).status_code == 400


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
