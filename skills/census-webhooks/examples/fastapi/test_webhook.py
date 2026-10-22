import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_census_webhook

SECRET = "census_test_secret_8f2d1c"

client = TestClient(app)

BASE = {"workspace_id": 3167, "sync_id": 3167956, "sync_run_id": 324399613}


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("CENSUS_WEBHOOK_SECRET", SECRET)


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Census signs the raw body: HMAC-SHA256, standard base64, in X-Signature."""
    return base64.b64encode(hmac.new(secret.encode(), payload, hashlib.sha256).digest()).decode()


def post(payload: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["X-Signature"] = signature
    return client.post("/webhooks/census", content=payload, headers=headers)


class TestVerify:
    payload = b'{"event":"sync.started"}'

    def test_valid_signature(self):
        assert verify_census_webhook(self.payload, sign(self.payload), SECRET)

    def test_rejects_hex_signature(self):
        hex_sig = hmac.new(SECRET.encode(), self.payload, hashlib.sha256).hexdigest()
        assert not verify_census_webhook(self.payload, hex_sig, SECRET)

    def test_rejects_other_secret(self):
        assert not verify_census_webhook(self.payload, sign(self.payload, "other"), SECRET)

    def test_rejects_missing_signature_or_secret(self):
        assert not verify_census_webhook(self.payload, None, SECRET)
        assert not verify_census_webhook(self.payload, sign(self.payload), "")


class TestEndpoint:
    def test_missing_signature(self):
        assert post(json.dumps({**BASE, "event": "sync.started"}).encode()).status_code == 400

    def test_invalid_signature(self):
        res = post(json.dumps({**BASE, "event": "sync.started"}).encode(), "bm9wZQ==")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_tampered_body(self):
        sig = sign(json.dumps({**BASE, "event": "sync.success"}).encode())
        res = post(json.dumps({**BASE, "event": "sync.failed"}).encode(), sig)
        assert res.status_code == 400

    @pytest.mark.parametrize("payload", [
        {**BASE, "event": "sync.triggered"},
        {**BASE, "event": "sync.started"},
        {**BASE, "event": "sync.completed", "status": "ok"},
        {**BASE, "event": "sync.completed", "status": "emergency"},
        {**BASE, "event": "sync.success"},
        {**BASE, "event": "sync.failed"},
        {
            **BASE,
            "alert_instance_id": 626248,
            "alert_type": "FailureAlertConfiguration",
            "message": "Sync Failed",
            "details": "Sync has failed with error: A mapped source column has been deleted: email",
            "followup_url": "https://app.getcensus.com/workspaces/3167/syncs/3167956/sync-history",
            "event": "sync.alert.raised",
        },
        {**BASE, "alert_instance_id": 626248, "alert_type": "FailureAlertConfiguration",
         "message": "Sync Recovered", "details": "Sync has recovered", "event": "sync.alert.resolved"},
    ])
    def test_signed_events(self, payload):
        body = json.dumps(payload).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"status": "success"}

    def test_any_content_type(self):
        body = json.dumps({**BASE, "event": "sync.success"}).encode()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_exact_bytes_with_whitespace(self):
        body = b'{ "workspace_id" : 3167 , "event" : "sync.started" }'
        assert post(body, sign(body)).status_code == 200

    def test_unknown_event_accepted_once_signed(self):
        body = json.dumps({**BASE, "event": "sync.something_new"}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_signed_non_json_body(self):
        body = b"not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_missing_secret(self, monkeypatch):
        monkeypatch.delenv("CENSUS_WEBHOOK_SECRET")
        body = json.dumps({**BASE, "event": "sync.started"}).encode()
        assert post(body, sign(body)).status_code == 500
