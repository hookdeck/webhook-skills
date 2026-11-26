import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Test secret only. Chatbase's docs don't say where the Action webhook secret is shown.
os.environ["CHATBASE_WEBHOOK_SECRET"] = "test_chatbase_webhook_secret"

from main import app, parse_event_type, verify_chatbase_signature  # noqa: E402

client = TestClient(app)
SECRET = os.environ["CHATBASE_WEBHOOK_SECRET"]


def sign(body: str, secret: str = SECRET) -> str:
    """Sign like Chatbase Action webhooks: hex(HMAC-SHA1(secret, raw body))."""
    return hmac.new(secret.encode(), body.encode(), hashlib.sha1).hexdigest()


# The leads.submit body Chatbase's webhook guide prints (placeholder values).
LEAD = {
    "eventType": "leads.submit",
    "chatbotId": "xxxxxxxx",
    "payload": {
        "conversationId": "xxxxxxxx",
        "customerEmail": "example@chatbase.co",
        "customerName": "Example",
        "customerPhone": "123",
        "customFields": {"Company name": "Acme", "Team size": 12, "utm_source": "google", "utm_campaign": "spring_sale"},
    },
}

# The fixtures below are illustrative: the guide documents these payloads as field shapes only.
PHONE = {
    "eventType": "phone_call.summary",
    "chatbotId": "agent_123",
    "payload": {
        "conversationId": "conv_789",
        "callSummary": "Example summary",
        "duration": 94,
        "callerNumber": "+15555550100",
        "calledNumber": "+15555550199",
    },
}

# "Book demo" and "Shipping address" are example Action names.
FORM = {
    "eventType": "Book demo_custom_form.submit",
    "chatbotId": "agent_123",
    "payload": {"conversationId": "conv_1", "data": {"field": "value"}, "error": None},
}

COLLECT = {
    "eventType": "Shipping address_collect_data.submit",
    "chatbotId": "agent_123",
    "payload": {"conversationId": "conv_2", "customFields": {"field": "value"}},
}


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["x-chatbase-signature"] = signature
    return client.post("/webhooks/chatbase", content=body, headers=headers)


class TestVerifyChatbaseSignature:
    body = json.dumps(LEAD)

    def test_accepts_valid_signature(self):
        assert verify_chatbase_signature(self.body.encode(), sign(self.body), SECRET) is True

    def test_accepts_uppercase_hex(self):
        assert verify_chatbase_signature(self.body.encode(), sign(self.body).upper(), SECRET) is True

    def test_signature_is_bare_hex(self):
        sig = sign(self.body)
        assert len(sig) == 40 and all(c in "0123456789abcdef" for c in sig)

    def test_rejects_tampered_body(self):
        assert verify_chatbase_signature(self.body.replace("Example", "Evil").encode(), sign(self.body), SECRET) is False

    def test_rejects_wrong_secret(self):
        assert verify_chatbase_signature(self.body.encode(), sign(self.body, "other_secret"), SECRET) is False

    def test_rejects_malformed_values(self):
        assert verify_chatbase_signature(self.body.encode(), sign(self.body)[:39], SECRET) is False
        assert verify_chatbase_signature(self.body.encode(), "z" * 40, SECRET) is False

    def test_rejects_sha256(self):
        sha256 = hmac.new(SECRET.encode(), self.body.encode(), hashlib.sha256).hexdigest()
        assert verify_chatbase_signature(self.body.encode(), sha256, SECRET) is False

    def test_rejects_missing_values(self):
        assert verify_chatbase_signature(self.body.encode(), None, SECRET) is False
        assert verify_chatbase_signature(self.body.encode(), sign(self.body), None) is False


def test_parse_event_type():
    assert parse_event_type("leads.submit") == {"kind": "leads.submit"}
    assert parse_event_type("phone_call.summary") == {"kind": "phone_call.summary"}
    assert parse_event_type("Book demo_custom_form.submit") == {"kind": "custom_form.submit", "actionName": "Book demo"}
    assert parse_event_type("Shipping address_collect_data.submit") == {
        "kind": "collect_data.submit",
        "actionName": "Shipping address",
    }
    assert parse_event_type("_custom_form.submit") == {"kind": "unknown"}
    assert parse_event_type("something.else") == {"kind": "unknown"}


class TestChatbaseEndpoint:
    def test_missing_signature(self):
        res = post(json.dumps(LEAD))
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing x-chatbase-signature header"

    def test_invalid_signature(self):
        res = post(json.dumps(LEAD), "a" * 40)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_wrong_secret_and_malformed_signature(self):
        body = json.dumps(LEAD)
        assert post(body, sign(body, "wrong_secret")).status_code == 400
        assert post(body, sign(body)[:39]).status_code == 400
        assert post(body, "g" * 40).status_code == 400

    def test_uppercase_hex_accepted(self):
        body = json.dumps(LEAD)
        assert post(body, sign(body).upper()).status_code == 200

    @pytest.mark.parametrize(
        "event,kind",
        [
            (LEAD, "leads.submit"),
            (PHONE, "phone_call.summary"),
            (FORM, "custom_form.submit"),
            (COLLECT, "collect_data.submit"),
        ],
    )
    def test_accepts_signed_events(self, event, kind):
        body = json.dumps(event)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True, "eventType": event["eventType"], "kind": kind}

    def test_unknown_event_acknowledged(self):
        body = json.dumps({"eventType": "new.event", "chatbotId": "x", "payload": {}})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json()["kind"] == "unknown"

    def test_any_content_type(self):
        body = json.dumps(LEAD)
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_signed_non_json(self):
        res = post("not json", sign("not json"), "text/plain")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"

    def test_missing_secret(self, monkeypatch):
        monkeypatch.delenv("CHATBASE_WEBHOOK_SECRET")
        body = json.dumps(LEAD)
        assert post(body, sign(body)).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
