import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# The HMAC Signature Key is a free-form string set on the webhook in Cloudsmith
os.environ["CLOUDSMITH_WEBHOOK_SECRET"] = "cloudsmith_test_signature_key"

from main import app, verify_cloudsmith_webhook  # noqa: E402

client = TestClient(app)

SECRET = os.environ["CLOUDSMITH_WEBHOOK_SECRET"]


def generate_cloudsmith_signature(payload: str, secret: str) -> str:
    """Generate an X-Cloudsmith-Signature value the same way Cloudsmith does: hex(HMAC-SHA1(key, raw_body))."""
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).hexdigest()


def event(event_id: str, data: dict | None = None) -> str:
    """Payload shaped like the package payload in Cloudsmith's docs."""
    return json.dumps(
        {
            "data": {
                "name": "my-file.deb",
                "namespace": "my-org",
                "repository": "my-repo",
                "format": "raw",
                "identifier_perm": "xKYgfsOsboz6",
                "stage_str": "Fully Synchronised",
                "status_str": "Completed",
                **(data or {}),
            },
            "meta": {
                "attempt_at": "2020-07-07T17:30:34.342167+00:00",
                "event_at": "2020-07-07T17:30:34.296482+00:00",
                "event_id": event_id,
                "trigger_id": "c0e2b63e-3d84-4d54-bd62-ae7d0b2764a7",
                "webhook_id": 1,
            },
        }
    )


def post_signed(payload: str, signature: str | None = None, content_type: str = "application/json"):
    if signature is None:
        signature = generate_cloudsmith_signature(payload, SECRET)
    return client.post(
        "/webhooks/cloudsmith",
        content=payload,
        headers={"Content-Type": content_type, "X-Cloudsmith-Signature": signature},
    )


class TestVerifyCloudsmithWebhook:
    payload = event("package.synced").encode()
    valid = generate_cloudsmith_signature(payload.decode(), SECRET)

    def test_accepts_valid_signature(self):
        assert verify_cloudsmith_webhook(self.payload, self.valid, SECRET)

    def test_accepts_uppercase_signature(self):
        assert verify_cloudsmith_webhook(self.payload, self.valid.upper(), SECRET)

    def test_rejects_other_key(self):
        sig = generate_cloudsmith_signature(self.payload.decode(), "other")
        assert not verify_cloudsmith_webhook(self.payload, sig, SECRET)

    def test_rejects_modified_body(self):
        assert not verify_cloudsmith_webhook(self.payload + b" ", self.valid, SECRET)

    def test_rejects_sha1_prefixed_value(self):
        assert not verify_cloudsmith_webhook(self.payload, "sha1=" + self.valid, SECRET)

    def test_rejects_sha256_signature(self):
        sig = hmac.new(SECRET.encode(), self.payload, hashlib.sha256).hexdigest()
        assert not verify_cloudsmith_webhook(self.payload, sig, SECRET)

    def test_rejects_base64_digest(self):
        import base64

        sig = base64.b64encode(hmac.new(SECRET.encode(), self.payload, hashlib.sha1).digest()).decode()
        assert not verify_cloudsmith_webhook(self.payload, sig, SECRET)

    @pytest.mark.parametrize("suffix", ["00", "\n", " "])
    def test_rejects_overlong_or_padded_value(self, suffix):
        assert not verify_cloudsmith_webhook(self.payload, self.valid + suffix, SECRET)

    def test_rejects_malformed_values(self):
        assert not verify_cloudsmith_webhook(self.payload, "abc", SECRET)
        assert not verify_cloudsmith_webhook(self.payload, self.valid[:38] + "zz", SECRET)

    def test_rejects_missing_or_empty_signature_or_secret(self):
        assert not verify_cloudsmith_webhook(self.payload, None, SECRET)
        assert not verify_cloudsmith_webhook(self.payload, "", SECRET)
        assert not verify_cloudsmith_webhook(self.payload, self.valid, None)
        assert not verify_cloudsmith_webhook(self.payload, self.valid, "")


class TestWebhookEndpoint:
    @pytest.mark.parametrize(
        "event_id",
        [
            "ping",
            "package.created",
            "package.deleted",
            "package.failed",
            "package.quarantined",
            "package.released",
            "package.restored",
            "package.security_scanned",
            "package.synced",
            "package.syncing",
            "package.tags_updated",
        ],
    )
    def test_accepts_events(self, event_id):
        response = post_signed(event(event_id))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_unknown_events(self):
        assert post_signed(event("package.something_new")).status_code == 200

    def test_accepts_json_array_format(self):
        assert post_signed(f"[{event('package.created')}]").status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post_signed(event("package.synced"), content_type="text/plain").status_code == 200

    def test_ignores_wrong_typed_fields(self):
        assert post_signed(json.dumps({"data": "nope", "meta": ["x"]})).status_code == 200
        assert post_signed(json.dumps({"data": {"name": 5}, "meta": {"event_id": 7}})).status_code == 200

    @pytest.mark.parametrize("body", ['"text"', "[1]", "null"])
    def test_rejects_signed_body_that_is_not_object_or_array(self, body):
        assert post_signed(body).status_code == 400

    def test_rejects_invalid_signature(self):
        assert post_signed(event("package.synced"), "deadbeef").status_code == 401

    def test_rejects_missing_signature(self):
        response = client.post(
            "/webhooks/cloudsmith",
            content=event("package.synced"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_rejects_altered_body(self):
        body = event("package.synced")
        sig = generate_cloudsmith_signature(body, SECRET)
        assert post_signed(body.replace("my-repo", "other-repo"), sig).status_code == 401

    def test_rejects_signed_non_json(self):
        assert post_signed("payload=%7B%7D").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
