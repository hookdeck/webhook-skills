import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Smartsheet assigns each webhook a random sharedSecret; it is used as-is as the HMAC key
SHARED_SECRET = "test_smartsheet_shared_secret"
os.environ["SMARTSHEET_SHARED_SECRET"] = SHARED_SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(payload: str, secret: str = SHARED_SECRET) -> str:
    """Smartsheet-Hmac-SHA256: hex HMAC-SHA256 of the raw request body."""
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def callback(events: list) -> str:
    return json.dumps({
        "nonce": "f1f8a8e6-5d2b-4a6c-9d0a-7f0f3a1b2c3d",
        "timestamp": "2026-10-22T10:00:00.000+00:00",
        "webhookId": 8444254503626628,
        "scope": "sheet",
        "scopeObjectId": 3285357287499652,
        "events": events,
    })


def post(body: str, headers: dict | None = None):
    return client.post(
        "/webhooks/smartsheet",
        content=body,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestVerificationChallenge:
    def test_echoes_challenge_in_header_and_body(self):
        body = json.dumps({"challenge": "abc-123", "webhookId": 8444254503626628})
        res = post(body, {"Smartsheet-Hook-Challenge": "abc-123"})
        assert res.status_code == 200
        assert res.headers["smartsheet-hook-response"] == "abc-123"
        assert res.json() == {"smartsheetHookResponse": "abc-123"}

    def test_answers_challenge_without_signature(self):
        res = post("{}", {"Smartsheet-Hook-Challenge": "unsigned"})
        assert res.status_code == 200
        assert res.headers["smartsheet-hook-response"] == "unsigned"

    def test_answers_challenge_with_bad_signature(self):
        res = post("{}", {"Smartsheet-Hook-Challenge": "c1", "Smartsheet-Hmac-SHA256": "deadbeef"})
        assert res.status_code == 200
        assert res.headers["smartsheet-hook-response"] == "c1"


class TestSignatureVerification:
    body = callback([{"objectType": "row", "eventType": "created", "id": 1, "userId": 2}])

    def test_accepts_valid_signature(self):
        res = post(self.body, {"Smartsheet-Hmac-SHA256": sign(self.body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_signature(self):
        res = post(self.body, {"Smartsheet-Hmac-SHA256": sign(self.body).upper()})
        assert res.status_code == 200

    def test_verifies_raw_body_regardless_of_content_type(self):
        res = post(self.body, {"Content-Type": "text/plain", "Smartsheet-Hmac-SHA256": sign(self.body)})
        assert res.status_code == 200

    def test_rejects_missing_signature(self):
        assert post(self.body).status_code == 400

    def test_rejects_wrong_secret(self):
        res = post(self.body, {"Smartsheet-Hmac-SHA256": sign(self.body, "wrong_secret")})
        assert res.status_code == 400

    def test_rejects_tampered_body(self):
        res = post(self.body.replace('"row"', '"cell"'), {"Smartsheet-Hmac-SHA256": sign(self.body)})
        assert res.status_code == 400

    def test_rejects_wrong_length_signature(self):
        assert post(self.body, {"Smartsheet-Hmac-SHA256": "abc"}).status_code == 400

    def test_rejects_invalid_json_when_signed(self):
        bad = "not json"
        assert post(bad, {"Smartsheet-Hmac-SHA256": sign(bad)}).status_code == 400


EVENTS = [
    {"objectType": "row", "eventType": "created", "id": 1},
    {"objectType": "row", "eventType": "updated", "id": 1},
    {"objectType": "row", "eventType": "deleted", "id": 1},
    {"objectType": "cell", "eventType": "updated", "rowId": 1, "columnId": 2},
    {"objectType": "sheet", "eventType": "updated", "id": 3},
    {"objectType": "comment", "eventType": "created", "id": 4},
]


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS, ids=lambda e: f"{e['objectType']}.{e['eventType']}")
    def test_acknowledges_event(self, event):
        body = callback([event])
        assert post(body, {"Smartsheet-Hmac-SHA256": sign(body)}).status_code == 200

    def test_handles_multiple_events(self):
        body = callback(EVENTS)
        assert post(body, {"Smartsheet-Hmac-SHA256": sign(body)}).status_code == 200

    def test_acknowledges_status_change_callback(self):
        body = json.dumps({
            "nonce": "n1",
            "webhookId": 8444254503626628,
            "scope": "sheet",
            "scopeObjectId": 3285357287499652,
            "newWebhookStatus": "DISABLED_SCOPE_INACCESSIBLE",
        })
        assert post(body, {"Smartsheet-Hmac-SHA256": sign(body)}).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
