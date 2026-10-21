# Generated with: instantly-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Instantly FastAPI webhook receiver.

Instantly has no signature: the credential a test can generate is the exact
header value configured on the webhook (here, Basic Auth as in the API docs).
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from main import app, header_name, idempotency_key, verify_instantly_header

client = TestClient(app)

BASIC = "Basic " + base64.b64encode(b"instantly:s3cr3t-p@ss").decode()
CUSTOM_SECRET = "c0ffee5ecret9f8e7d6c5b4a3928170615"

# Shape from Instantly's webhook events guide.
REPLY = {
    "timestamp": "2026-10-20T21:44:23.244Z",
    "event_type": "reply_received",
    "workspace": "01a15b45-cbcb-78f8-aacd-5a2b788de0d5",
    "campaign_id": "01a15b45-cbcc-7e79-9923-767240005bcf",
    "campaign_name": "Q4 Outbound",
    "lead_email": "jane@example.com",
    "email_account": "sales@yourdomain.com",
    "step": 1,
    "variant": 1,
    "is_first": True,
    "reply_subject": "Re: Quick question",
    "reply_text_snippet": "Sounds interesting, can we talk Tuesday?",
}

EVENT_TYPES = [
    "email_sent",
    "email_opened",
    "email_link_clicked",
    "link_clicked",
    "reply_received",
    "auto_reply_received",
    "email_bounced",
    "lead_unsubscribed",
    "account_error",
    "campaign_completed",
    "lead_interested",
    "lead_not_interested",
    "lead_neutral",
    "lead_meeting_booked",
    "lead_meeting_completed",
    "lead_no_show",
    "lead_closed",
    "lead_out_of_office",
    "lead_wrong_person",
    "Hot Prospect",  # custom label, sent as-is
]


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.delenv("INSTANTLY_WEBHOOK_HEADER", raising=False)
    monkeypatch.setenv("INSTANTLY_WEBHOOK_SECRET", BASIC)


def post(body, headers=None):
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/instantly",
        content=content,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestVerifyInstantlyHeader:
    def test_accepts_exact_value(self):
        assert verify_instantly_header(BASIC, BASIC)

    def test_rejects_same_length_different_value(self):
        wrong = BASIC[:-1] + ("B" if BASIC.endswith("A") else "A")
        assert not verify_instantly_header(wrong, BASIC)

    def test_rejects_different_length(self):
        assert not verify_instantly_header("Basic short", BASIC)

    def test_rejects_credential_without_scheme(self):
        assert not verify_instantly_header(BASIC.replace("Basic ", ""), BASIC)

    def test_fails_closed_on_missing_values(self):
        assert not verify_instantly_header(None, BASIC)
        assert not verify_instantly_header(BASIC, None)
        assert not verify_instantly_header("", "")


class TestHeaderName:
    def test_defaults_to_authorization(self):
        assert header_name({}) == "authorization"

    def test_lowercases_configured_name(self):
        assert header_name({"INSTANTLY_WEBHOOK_HEADER": "X-Instantly-Secret"}) == "x-instantly-secret"


def test_idempotency_key_is_stable_and_distinct():
    assert idempotency_key(REPLY) == idempotency_key(dict(REPLY))
    assert idempotency_key(REPLY) != idempotency_key({**REPLY, "event_type": "email_opened"})


class TestWebhookEndpoint:
    def test_valid_authorization_header(self):
        res = post(REPLY, {"Authorization": BASIC})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_valid_custom_secret_header(self, monkeypatch):
        monkeypatch.setenv("INSTANTLY_WEBHOOK_HEADER", "X-Instantly-Secret")
        monkeypatch.setenv("INSTANTLY_WEBHOOK_SECRET", CUSTOM_SECRET)
        res = post(REPLY, {"x-instantly-secret": CUSTOM_SECRET})
        assert res.status_code == 200

    def test_custom_header_configured_but_authorization_sent(self, monkeypatch):
        monkeypatch.setenv("INSTANTLY_WEBHOOK_HEADER", "X-Instantly-Secret")
        monkeypatch.setenv("INSTANTLY_WEBHOOK_SECRET", CUSTOM_SECRET)
        res = post(REPLY, {"Authorization": CUSTOM_SECRET})
        assert res.status_code == 401

    def test_missing_header(self):
        assert post(REPLY).status_code == 401

    def test_wrong_credential(self):
        wrong = "Basic " + base64.b64encode(b"instantly:wrong").decode()
        assert post(REPLY, {"Authorization": wrong}).status_code == 401

    def test_unconfigured_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("INSTANTLY_WEBHOOK_SECRET")
        assert post(REPLY, {"Authorization": BASIC}).status_code == 500

    def test_invalid_json_after_auth(self):
        assert post("{not json", {"Authorization": BASIC}).status_code == 400

    def test_authenticates_before_parsing(self):
        assert post("{not json", {"Authorization": "Basic nope"}).status_code == 401

    @pytest.mark.parametrize("event_type", EVENT_TYPES)
    def test_handles_event_type(self, event_type):
        res = post({**REPLY, "event_type": event_type}, {"Authorization": BASIC})
        assert res.status_code == 200

    def test_custom_label_falls_through(self, capsys):
        post({**REPLY, "event_type": "Hot Prospect"}, {"Authorization": BASIC})
        assert "Custom label" in capsys.readouterr().out
