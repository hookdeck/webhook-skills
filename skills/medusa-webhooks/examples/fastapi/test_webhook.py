import hashlib
import hmac
import json
import os
import time

import pytest

# The endpoint signing secret is used as a raw UTF-8 string
SECRET = "test_signing_secret"
os.environ["MEDUSA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_medusa_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = SECRET, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    v1 = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def event(event_type: str, data=None) -> dict:
    return {
        "id": "whev_01HXYZ4567ABCDEF",
        "type": event_type,
        "created_at": "2024-11-12T10:03:00.000Z",
        "data": {
            "organization": {"id": "org_01HXYZ9012ABCDEF", "name": "Acme Corp"},
            "project": {"id": "proj_01HXYZ3456ABCDEF", "name": "My Storefront", "handle": "my-storefront"},
            "environment": {"id": "projenv_01HXYZ7890ABCDEF", "name": "Production", "handle": "production", "branch": "main"},
            **(data or {}),
        },
    }


def post(body: str, header: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header:
        headers["X-Medusa-Signature"] = header
    return client.post("/webhooks/medusa", content=body, headers=headers)


class TestVerify:
    body = json.dumps(event("build.created"))

    def test_valid_signature(self):
        assert verify_medusa_webhook(self.body.encode(), sign(self.body), SECRET)

    def test_wrong_secret(self):
        assert not verify_medusa_webhook(self.body.encode(), sign(self.body, "other_secret"), SECRET)

    def test_tampered_body(self):
        assert not verify_medusa_webhook((self.body + " ").encode(), sign(self.body), SECRET)

    def test_old_timestamp_accepted_by_default(self, monkeypatch):
        # Hookdeck retries and replays keep the original t
        monkeypatch.delenv("MEDUSA_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 86400
        assert verify_medusa_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_old_timestamp_rejected_with_explicit_tolerance(self):
        old = int(time.time()) - 600
        assert not verify_medusa_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=300)

    def test_old_timestamp_rejected_when_window_set(self, monkeypatch):
        monkeypatch.setenv("MEDUSA_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 600
        assert not verify_medusa_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("MEDUSA_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 600
        assert verify_medusa_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_stale_timestamp_with_wider_tolerance(self):
        old = int(time.time()) - 600
        assert verify_medusa_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=3600)

    def test_malformed_headers(self):
        for bad in ["garbage", "t=abc,v1=00", f"t={int(time.time())}", None, ""]:
            assert not verify_medusa_webhook(self.body.encode(), bad, SECRET)

    def test_any_v1_signature_matches(self):
        assert verify_medusa_webhook(self.body.encode(), f"{sign(self.body)},v1=deadbeef", SECRET)


class TestEndpoint:
    @pytest.mark.parametrize(
        "event_type",
        [
            "build.created",
            "build.succeeded",
            "build.failed",
            "build.canceled",
            "deployment.created",
            "deployment.succeeded",
            "deployment.failed",
            "deployment.canceled",
            "something.new",
        ],
    )
    def test_event_types(self, event_type):
        body = json.dumps(event(event_type, {"build": {"id": "build_1"}, "deployment": {"id": "depl_1"}}))
        assert post(body, sign(body)).status_code == 200

    def test_any_content_type(self):
        body = json.dumps(event("build.succeeded"))
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_invalid_signature(self):
        body = json.dumps(event("build.created"))
        assert post(body, sign(body, "wrong_secret")).status_code == 400

    def test_missing_header(self):
        assert post(json.dumps(event("build.created"))).status_code == 400

    def test_signed_array(self):
        body = json.dumps([event("build.created")])
        assert post(body, sign(body)).status_code == 400

    def test_signed_invalid_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
