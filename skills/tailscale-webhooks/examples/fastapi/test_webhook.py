import hashlib
import hmac
import json
import os
import time

# Tailscale secrets look like tskey-webhook-xxxxx and are used as a raw string
SECRET = "tskey-webhook-test123"
os.environ["TAILSCALE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_tailscale_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = SECRET, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    v1 = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def event(event_type: str, data=None) -> dict:
    return {
        "timestamp": "2022-09-21T13:59:02.949217-04:00",
        "version": 1,
        "type": event_type,
        "tailnet": "example.com",
        "message": f"{event_type} happened",
        "data": data,
    }


def post(body: str, header: str | None = None):
    headers = {"Content-Type": "application/json"}
    if header:
        headers["Tailscale-Webhook-Signature"] = header
    return client.post("/webhooks/tailscale", content=body, headers=headers)


class TestVerify:
    body = json.dumps([event("test")])

    def test_valid_signature(self):
        assert verify_tailscale_webhook(self.body.encode(), sign(self.body), SECRET)

    def test_wrong_secret(self):
        assert not verify_tailscale_webhook(self.body.encode(), sign(self.body, "tskey-webhook-other"), SECRET)

    def test_tampered_body(self):
        assert not verify_tailscale_webhook((self.body + " ").encode(), sign(self.body), SECRET)

    def test_old_timestamp_accepted_by_default(self, monkeypatch):
        # Retries (Tailscale's hourly ones, Hookdeck's) keep the original t
        monkeypatch.delenv("TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 86400
        assert verify_tailscale_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_old_timestamp_rejected_with_explicit_tolerance(self):
        old = int(time.time()) - 600
        assert not verify_tailscale_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=300)

    def test_old_timestamp_rejected_when_window_set(self, monkeypatch):
        monkeypatch.setenv("TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 600
        assert not verify_tailscale_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 600
        assert verify_tailscale_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_stale_timestamp_with_wider_tolerance(self):
        old = int(time.time()) - 600
        assert verify_tailscale_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=3600)

    def test_malformed_headers(self):
        for bad in ["garbage", "t=abc,v1=00", f"t={int(time.time())}", None, ""]:
            assert not verify_tailscale_webhook(self.body.encode(), bad, SECRET)

    def test_any_v1_signature_matches(self):
        assert verify_tailscale_webhook(self.body.encode(), f"{sign(self.body)},v1=deadbeef", SECRET)


class TestEndpoint:
    def test_valid_batch(self):
        body = json.dumps([
            event("test"),
            event("nodeCreated", {"nodeID": "nFJw3SRKTM59", "deviceName": "alice-ws1.ts.net"}),
            event("nodeNeedsApproval", {"deviceName": "alice-ws1.ts.net"}),
            event("nodeApproved", {"deviceName": "alice-ws1.ts.net"}),
            event("nodeKeyExpiringInOneDay", {"deviceName": "alice-ws1.ts.net"}),
            event("nodeDeleted", {"deviceName": "alice-ws1.ts.net"}),
            event("policyUpdate", {"actor": "admin@example.com"}),
            event("userCreated", {"user": "bob@example.com"}),
            event("somethingNew"),
        ])
        assert post(body, sign(body)).status_code == 200

    def test_invalid_signature(self):
        body = json.dumps([event("test")])
        assert post(body, sign(body, "tskey-webhook-wrong")).status_code == 400

    def test_missing_header(self):
        assert post(json.dumps([event("test")])).status_code == 400

    def test_signed_non_array(self):
        body = json.dumps({"type": "test"})
        assert post(body, sign(body)).status_code == 400

    def test_signed_invalid_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
