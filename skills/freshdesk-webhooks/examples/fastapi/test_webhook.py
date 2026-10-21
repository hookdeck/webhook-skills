import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient

# Freshdesk does not sign webhooks. The "secret" is a random value YOU put in the
# Trigger Webhook action's custom headers; tests send it the same way.
SECRET = "3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e"
os.environ["FRESHDESK_WEBHOOK_SECRET"] = SECRET
os.environ.pop("FRESHDESK_WEBHOOK_HEADER", None)

from main import (  # noqa: E402
    TICKET_CREATED,
    TICKET_UPDATED,
    app,
    dedupe_key,
    dispatch,
    verify_freshdesk_secret,
)

client = TestClient(app)
PATH = "/webhooks/freshdesk"


@pytest.fixture(autouse=True)
def _reset_env():
    os.environ["FRESHDESK_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("FRESHDESK_WEBHOOK_HEADER", None)
    yield
    os.environ["FRESHDESK_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("FRESHDESK_WEBHOOK_HEADER", None)


def ticket_payload(event, **overrides):
    """Mirrors the Advanced JSON template from references/setup.md, substituted."""
    ticket = {
        "id": "1042",
        "subject": "Refund request",
        "status": "Open",
        "priority": "High",
        "requester_email": "amy@example.com",
        "url": "https://acme.freshdesk.com/helpdesk/tickets/1042",
    }
    ticket.update(overrides)
    return {"event": event, "triggered_event": "Ticket is created", "ticket": ticket}


def send(body, header="X-Freshdesk-Webhook-Secret", secret=SECRET, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if secret is not None:
        headers[header] = secret
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post(PATH, content=content, headers=headers)


class TestVerifyFreshdeskSecret:
    def test_accepts_matching_secret(self):
        assert verify_freshdesk_secret(SECRET) is True

    def test_rejects_wrong_secret_same_length(self):
        assert verify_freshdesk_secret("0" * len(SECRET)) is False

    def test_rejects_length_mismatch(self):
        assert verify_freshdesk_secret(SECRET + "0") is False

    def test_rejects_missing_header(self):
        assert verify_freshdesk_secret(None) is False

    def test_fails_closed_when_unset(self):
        del os.environ["FRESHDESK_WEBHOOK_SECRET"]
        with pytest.raises(RuntimeError, match="FRESHDESK_WEBHOOK_SECRET"):
            verify_freshdesk_secret(SECRET)


class TestWebhookEndpoint:
    def test_accepts_ticket_created(self):
        res = send(ticket_payload(TICKET_CREATED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_ticket_updated(self):
        res = send(ticket_payload(TICKET_UPDATED, status="Resolved"))
        assert res.status_code == 200

    def test_header_name_is_case_insensitive(self):
        res = send(ticket_payload(TICKET_CREATED), header="x-freshdesk-webhook-secret")
        assert res.status_code == 200

    def test_uses_configured_header_name(self):
        os.environ["FRESHDESK_WEBHOOK_HEADER"] = "X-Acme-Token"
        assert send(ticket_payload(TICKET_CREATED), header="X-Acme-Token").status_code == 200
        assert send(ticket_payload(TICKET_CREATED)).status_code == 401

    def test_rejects_missing_secret(self):
        assert send(ticket_payload(TICKET_CREATED), secret=None).status_code == 401

    def test_rejects_wrong_secret(self):
        assert send(ticket_payload(TICKET_CREATED), secret="not-the-secret").status_code == 401

    def test_checks_secret_before_parsing(self):
        assert send("{not json", secret="wrong").status_code == 401

    def test_fails_closed_when_secret_unset(self):
        del os.environ["FRESHDESK_WEBHOOK_SECRET"]
        assert send(ticket_payload(TICKET_CREATED)).status_code == 500

    def test_rejects_invalid_json(self):
        res = send(
            "<freshdesk_webhook><ticket_id>1</ticket_id></freshdesk_webhook>",
            content_type="application/xml",
        )
        assert res.status_code == 400

    def test_rejects_missing_event(self):
        assert send({"ticket": {"id": "1042"}}).status_code == 400

    def test_acknowledges_unknown_event(self):
        assert send(ticket_payload("ticket_escalated")).status_code == 200


class TestDispatch:
    def test_recognises_both_events(self):
        assert asyncio.run(dispatch(ticket_payload(TICKET_CREATED))) is True
        assert asyncio.run(dispatch(ticket_payload(TICKET_UPDATED))) is True

    def test_unknown_event(self):
        assert asyncio.run(dispatch(ticket_payload("something_else"))) is False

    def test_tolerates_missing_ticket(self):
        assert asyncio.run(dispatch({"event": TICKET_CREATED})) is True


class TestDedupeKey:
    def test_combines_event_id_status(self):
        assert dedupe_key(ticket_payload(TICKET_UPDATED)) == "ticket_updated:1042:Open"

    def test_none_without_ticket_id(self):
        assert dedupe_key({"event": TICKET_CREATED}) is None
