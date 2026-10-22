import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# VGS integration secrets are opaque strings; this one is only for tests
SECRET = "test_vgs_integration_secret_5f2a"
os.environ["VGS_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, t=None, secret=SECRET) -> str:
    ts = int(time.time()) if t is None else t
    v0 = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={ts},v0={v0}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["vgs-signature"] = signature
    return client.post("/webhooks/vgs", content=body, headers=headers)


ROUTE_UPDATED = json.dumps(
    {"event": "route.updated", "details": {"route_id": "r1", "route_name": "inbound", "environment": "sandbox"}}
)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(ROUTE_UPDATED, sign(ROUTE_UPDATED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_any_content_type(self):
        assert post(ROUTE_UPDATED, sign(ROUTE_UPDATED), "text/plain").status_code == 200

    def test_rejects_missing_header(self):
        assert post(ROUTE_UPDATED).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(ROUTE_UPDATED.replace("inbound", "outbound"), sign(ROUTE_UPDATED)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(ROUTE_UPDATED, sign(ROUTE_UPDATED, secret="other_secret")).status_code == 400

    def test_rejects_modified_timestamp(self):
        t = int(time.time())
        v0 = sign(ROUTE_UPDATED, t).split("v0=")[1]
        assert post(ROUTE_UPDATED, f"t={t + 1},v0={v0}").status_code == 400

    def test_rejects_signature_of_different_length(self):
        assert post(ROUTE_UPDATED, "t=1623691785,v0=abc").status_code == 400

    def test_rejects_malformed_header(self):
        assert post(ROUTE_UPDATED, "garbage").status_code == 400
        assert post(ROUTE_UPDATED, "t=1623691785").status_code == 400

    def test_accepts_old_timestamp_by_default(self, monkeypatch):
        # Retries and replays keep the original timestamp, so the window is off by default
        monkeypatch.delenv("VGS_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 3600
        assert post(ROUTE_UPDATED, sign(ROUTE_UPDATED, t=old)).status_code == 200

    def test_rejects_old_timestamp_when_window_set(self, monkeypatch):
        monkeypatch.setenv("VGS_TIMESTAMP_TOLERANCE_SECONDS", "60")
        old = int(time.time()) - 3600
        assert post(ROUTE_UPDATED, sign(ROUTE_UPDATED, t=old)).status_code == 400
        assert post(ROUTE_UPDATED, sign(ROUTE_UPDATED)).status_code == 200

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("VGS_TIMESTAMP_TOLERANCE_SECONDS", "one minute")
        old = int(time.time()) - 3600
        assert post(ROUTE_UPDATED, sign(ROUTE_UPDATED, t=old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize(
        "event,rest",
        [
            ("route.created", {"details": {"route_id": "r1", "route_name": "a", "environment": "sandbox"}}),
            ("route.updated", {"details": {"route_id": "r1", "route_name": "a", "environment": "sandbox"}}),
            ("route.delete", {"details": {"route_id": "r1", "route_name": "a", "environment": "live"}}),
            ("vault.created", {"details": {"vault_id": "tntabc", "vault_name": "v", "environment": "sandbox"}}),
            ("user.permissions_updated", {"details": {"user_email": "a@example.com", "org_id": "o1"}}),
            ("user.permissions_deleted", {"details": {"user_email": "a@example.com", "org_id": "o1"}}),
            ("user.logged_in", {"details": {"user_email": "a@example.com", "user_ip": "203.0.113.5"}}),
            ("user.password_updated", {"details": {"user_email": "a@example.com", "user_ip": "203.0.113.5"}}),
            ("user.mfa_created", {"details": {"user_email": "a@example.com", "user_ip": "203.0.113.5"}}),
            ("user.mfa_deleted", {"details": {"user_email": "a@example.com", "user_ip": "203.0.113.5"}}),
            ("proxy.upstream_error", {"occurrence": 10, "details": {"upstream_host": "api.example.com", "upstream_error": "timeout"}}),
            ("alias.reveal_failed", {"occurrence": 1, "details": {"environment": "sandbox", "storage": "persistent"}}),
            ("something.else", {}),
        ],
    )
    def test_handles_event(self, event, rest):
        body = json.dumps({"event": event, **rest})
        assert post(body, sign(body)).status_code == 200

    def test_rejects_verified_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_rejects_verified_non_object_json(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400
