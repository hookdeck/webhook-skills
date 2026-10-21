import hashlib
import hmac
import json
import os
import time

import pytest

# Pipedream signing keys are opaque strings used verbatim (UTF-8) as the HMAC key.
SIGNING_KEY = "pd_test_signing_key_4f3c2b1a0e9d8c7b6a5f4e3d2c1b0a99"
CONNECT_TOKEN = "connect-url-token-123"
os.environ["PIPEDREAM_WEBHOOK_SIGNING_KEY"] = SIGNING_KEY
os.environ["PIPEDREAM_CONNECT_WEBHOOK_TOKEN"] = CONNECT_TOKEN

from fastapi.testclient import TestClient  # noqa: E402

from main import app, parse_signature_header, verify_pipedream_signature  # noqa: E402

client = TestClient(app)


def signature_header(payload: str, key: str = SIGNING_KEY, timestamp: int | None = None) -> str:
    """Build x-pd-signature exactly as Pipedream does: t=<seconds>,v1=<hex HMAC of "t.body">."""
    t = int(time.time()) if timestamp is None else timestamp
    sig = hmac.new(key.encode(), f"{t}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={sig}"


# A trigger delivery body is whatever the deployed trigger emitted (here, gitlab-new-issue).
TRIGGER_EVENT = {
    "object_kind": "issue",
    "project": {"id": 45672541, "name": "demo"},
    "object_attributes": {"id": 1, "iid": 7, "title": "Bug report", "action": "open"},
}

CONNECTION_SUCCESS = {
    "event": "CONNECTION_SUCCESS",
    "connect_token": "ctok_xxxxxxx",
    "environment": "production",
    "connect_session_id": 1.4058728083872854e38,
    "account": {
        "id": "apn_xxxxxxx",
        "name": "jane@example.com",
        "external_id": "user-abc-123",
        "healthy": True,
        "dead": None,
        "app": {"id": "oa_xxxxxxx", "name_slug": "google_sheets", "name": "Google Sheets", "auth_type": "oauth"},
        "created_at": "2026-03-25T17:49:15.000Z",
        "updated_at": "2026-03-25T17:49:15.000Z",
    },
}

CONNECTION_ERROR = {
    "event": "CONNECTION_ERROR",
    "connect_token": "ctok_xxxxxxx",
    "environment": "production",
    "connect_session_id": 1.4058727315359677e38,
    "error": "Test request failed. Please verify your credentials and try again.",
}

BODY = json.dumps(TRIGGER_EVENT, separators=(",", ":"))


class TestVerifyPipedreamSignature:
    def test_accepts_valid_signature(self):
        assert verify_pipedream_signature(BODY.encode(), signature_header(BODY), SIGNING_KEY) == (True, None)

    def test_matches_docs_header_format(self):
        header = signature_header(BODY, timestamp=1616000000)
        assert header.startswith("t=1616000000,v1=") and len(header.split("v1=")[1]) == 64
        assert verify_pipedream_signature(BODY.encode(), header, SIGNING_KEY, now=1616000000)[0]

    def test_rejects_missing_header(self):
        assert verify_pipedream_signature(BODY.encode(), None, SIGNING_KEY) == (False, "Missing x-pd-signature header")

    @pytest.mark.parametrize("header", ["v1=abc", "t=123", "t=abc,v1=deadbeef", "garbage"])
    def test_rejects_malformed_header(self, header):
        assert verify_pipedream_signature(BODY.encode(), header, SIGNING_KEY) == (
            False,
            "Malformed x-pd-signature header",
        )

    def test_rejects_stale_timestamp(self):
        header = signature_header(BODY, timestamp=int(time.time()) - 301)
        assert verify_pipedream_signature(BODY.encode(), header, SIGNING_KEY) == (False, "Timestamp outside tolerance")

    def test_rejects_wrong_key(self):
        header = signature_header(BODY, key="other")
        assert verify_pipedream_signature(BODY.encode(), header, SIGNING_KEY) == (False, "Invalid signature")

    def test_rejects_reserialised_body(self):
        pretty = json.dumps(TRIGGER_EVENT, indent=2)
        assert not verify_pipedream_signature(pretty.encode(), signature_header(BODY), SIGNING_KEY)[0]

    def test_parses_header(self):
        assert parse_signature_header("t=1616000000,v1=ABCDEF") == ("1616000000", ["abcdef"])


class TestTriggerWebhook:
    def post(self, body: str, headers: dict | None = None):
        return client.post(
            "/webhooks/pipedream",
            content=body,
            headers={"content-type": "application/json", **(headers or {})},
        )

    def test_valid_signed_event_returns_200(self):
        res = self.post(BODY, {"x-pd-signature": signature_header(BODY)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_missing_signature_returns_400(self):
        assert self.post(BODY).status_code == 400

    def test_tampered_body_returns_400(self):
        res = self.post(BODY.replace("Bug report", "Tampered"), {"x-pd-signature": signature_header(BODY)})
        assert res.status_code == 400

    def test_stale_timestamp_returns_400(self):
        header = signature_header(BODY, timestamp=int(time.time()) - 600)
        assert self.post(BODY, {"x-pd-signature": header}).status_code == 400

    def test_signed_non_json_returns_400(self):
        res = self.post("not json", {"x-pd-signature": signature_header("not json")})
        assert res.status_code == 400
        assert res.json() == {"error": "Invalid JSON payload"}


class TestConnectionWebhook:
    @pytest.mark.parametrize("payload", [CONNECTION_SUCCESS, CONNECTION_ERROR], ids=["CONNECTION_SUCCESS", "CONNECTION_ERROR"])
    def test_connection_events_return_200(self, payload):
        res = client.post(f"/webhooks/pipedream/connect?token={CONNECT_TOKEN}", json=payload)
        assert res.status_code == 200

    def test_missing_or_wrong_token_returns_400(self):
        assert client.post("/webhooks/pipedream/connect", json=CONNECTION_SUCCESS).status_code == 400
        assert client.post("/webhooks/pipedream/connect?token=nope", json=CONNECTION_SUCCESS).status_code == 400

    def test_invalid_json_returns_400(self):
        res = client.post(
            f"/webhooks/pipedream/connect?token={CONNECT_TOKEN}",
            content="{bad",
            headers={"content-type": "application/json"},
        )
        assert res.status_code == 400
