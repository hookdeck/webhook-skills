import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

SECRET = "test_mautic_secret"
os.environ["MAUTIC_WEBHOOK_SECRET"] = SECRET

from main import app, verify_mautic_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = SECRET) -> str:
    """Real Mautic algorithm: base64(HMAC-SHA256(raw_body, secret))."""
    return base64.b64encode(
        hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    ).decode()


NEW_CONTACT = json.dumps(
    {"mautic.lead_post_save_new": [{"contact": {"id": 1}, "timestamp": "2026-01-01T12:00:00+00:00"}]}
)


class TestVerify:
    def test_valid_signature(self):
        assert verify_mautic_webhook(NEW_CONTACT.encode(), sign(NEW_CONTACT), SECRET)

    def test_wrong_secret(self):
        assert not verify_mautic_webhook(NEW_CONTACT.encode(), sign(NEW_CONTACT, "other"), SECRET)

    def test_tampered_body(self):
        assert not verify_mautic_webhook((NEW_CONTACT + " ").encode(), sign(NEW_CONTACT), SECRET)

    def test_missing_or_short_signature(self):
        assert not verify_mautic_webhook(NEW_CONTACT.encode(), None, SECRET)
        assert not verify_mautic_webhook(NEW_CONTACT.encode(), "short", SECRET)


class TestEndpoint:
    def post(self, body: str, signature: str | None, content_type: str = "application/json"):
        headers = {"content-type": content_type}
        if signature is not None:
            headers["webhook-signature"] = signature
        return client.post("/webhooks/mautic", content=body, headers=headers)

    def test_valid_event(self):
        assert self.post(NEW_CONTACT, sign(NEW_CONTACT)).status_code == 200

    def test_any_content_type(self):
        assert self.post(NEW_CONTACT, sign(NEW_CONTACT), "text/plain").status_code == 200

    def test_batched_events(self):
        batch = json.dumps({
            "mautic.form_on_submit": [
                {"submission": {"id": 1}, "timestamp": "2026-01-01T12:00:00+00:00"},
                {"submission": {"id": 2}, "timestamp": "2026-01-01T12:00:01+00:00"},
            ],
            "mautic.email_on_open": [
                {"email": {"id": 3}, "contact": {"id": 4}, "timestamp": "2026-01-01T12:00:02+00:00"}
            ],
            "mautic.unknown_event": [{"timestamp": "2026-01-01T12:00:03+00:00"}],
        })
        assert self.post(batch, sign(batch)).status_code == 200

    def test_invalid_signature(self):
        assert self.post(NEW_CONTACT, sign(NEW_CONTACT, "wrong")).status_code == 400

    def test_missing_signature(self):
        assert self.post(NEW_CONTACT, None).status_code == 400

    def test_signed_non_json(self):
        assert self.post("not json", sign("not json")).status_code == 400
