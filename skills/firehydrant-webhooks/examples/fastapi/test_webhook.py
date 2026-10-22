import hashlib
import hmac
import json
import os

os.environ["FIREHYDRANT_WEBHOOK_SECRET"] = "test_firehydrant_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_firehydrant_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["FIREHYDRANT_WEBHOOK_SECRET"]


def sign(payload: str | bytes, secret: str = SECRET) -> str:
    """Same algorithm FireHydrant uses: bare hex HMAC-SHA256 of the raw body."""
    body = payload.encode() if isinstance(payload, str) else payload
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


INCIDENT = json.dumps({
    "data": {"incident": {"number": 602, "name": "Test incident", "current_milestone": "resolved"}},
    "event": {"operation": "UPDATED", "resource_type": "incident"},
})
CHANGE_EVENT = json.dumps({
    "data": {"id": "489d7b90", "summary": "Production Deploy"},
    "event": {"operation": "updated", "resource_type": "change_event"},
})
ALERT = json.dumps({
    "data": {"alert": {"id": "6f76", "summary": "High error rate", "status": "opened", "decision": None}},
    "event": {"operation": "CREATED", "resource_type": "signals_alerts"},
})


def post(body: str, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["fh-signature"] = signature
    return client.post("/webhooks/firehydrant", content=body, headers=headers)


class TestVerify:
    def test_valid_signature(self):
        assert verify_firehydrant_webhook(INCIDENT.encode(), sign(INCIDENT), SECRET)

    def test_invalid_signature(self):
        assert not verify_firehydrant_webhook(INCIDENT.encode(), "invalid", SECRET)

    def test_missing_signature(self):
        assert not verify_firehydrant_webhook(INCIDENT.encode(), None, SECRET)

    def test_wrong_secret(self):
        assert not verify_firehydrant_webhook(INCIDENT.encode(), sign(INCIDENT, "other"), SECRET)

    def test_tampered_body(self):
        assert not verify_firehydrant_webhook((INCIDENT + " ").encode(), sign(INCIDENT), SECRET)

    def test_prefixed_signature_rejected(self):
        assert not verify_firehydrant_webhook(INCIDENT.encode(), f"sha256={sign(INCIDENT)}", SECRET)


class TestEndpoint:
    def test_missing_signature(self):
        assert post(INCIDENT).status_code == 400

    def test_invalid_signature(self):
        assert post(INCIDENT, "deadbeef").status_code == 400

    def test_incident(self):
        res = post(INCIDENT, sign(INCIDENT))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_change_event(self):
        assert post(CHANGE_EVENT, sign(CHANGE_EVENT)).status_code == 200

    def test_signals_alerts(self):
        assert post(ALERT, sign(ALERT)).status_code == 200

    def test_non_json_content_type_verifies(self):
        assert post(INCIDENT, sign(INCIDENT), "text/plain").status_code == 200

    def test_signed_non_json_body(self):
        assert post("not json", sign("not json"), "text/plain").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
