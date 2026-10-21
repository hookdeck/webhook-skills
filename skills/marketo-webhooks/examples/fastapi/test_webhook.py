import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient

# Marketo does not sign webhooks. The "secret" is a random value YOU put in the
# Smart Campaign webhook's custom headers; tests send it the same way.
SECRET = "3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e"
os.environ["MARKETO_WEBHOOK_SECRET"] = SECRET
os.environ.pop("MARKETO_WEBHOOK_HEADER", None)

from main import (  # noqa: E402
    LEAD_CREATED,
    LEAD_UPDATED,
    app,
    dedupe_key,
    dispatch,
    verify_marketo_secret,
)

client = TestClient(app)
PATH = "/webhooks/marketo"


@pytest.fixture(autouse=True)
def _reset_env():
    os.environ["MARKETO_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("MARKETO_WEBHOOK_HEADER", None)
    yield
    os.environ["MARKETO_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("MARKETO_WEBHOOK_HEADER", None)


def lead_payload(event, **overrides):
    """Mirrors the Payload Template from references/setup.md, substituted."""
    lead = {
        "id": 1042,
        "email": "amy@example.com",
        "first_name": "Amy",
        "last_name": "Chen",
        "company": "Acme Inc",
    }
    lead.update(overrides)
    return {"event": event, "campaign": "Webinar follow-up", "lead": lead}


def send(body, header="X-Webhook-Secret", secret=SECRET, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if secret is not None:
        headers[header] = secret
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post(PATH, content=content, headers=headers)


class TestVerifyMarketoSecret:
    def test_accepts_matching_secret(self):
        assert verify_marketo_secret(SECRET) is True

    def test_rejects_wrong_secret_same_length(self):
        assert verify_marketo_secret("0" * len(SECRET)) is False

    def test_rejects_length_mismatch(self):
        assert verify_marketo_secret(SECRET + "0") is False

    def test_rejects_missing_header(self):
        assert verify_marketo_secret(None) is False

    def test_fails_closed_when_unset(self):
        del os.environ["MARKETO_WEBHOOK_SECRET"]
        with pytest.raises(RuntimeError, match="MARKETO_WEBHOOK_SECRET"):
            verify_marketo_secret(SECRET)


class TestWebhookEndpoint:
    def test_accepts_lead_created(self):
        res = send(lead_payload(LEAD_CREATED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lead_updated(self):
        res = send(lead_payload(LEAD_UPDATED, company="Acme Corp"))
        assert res.status_code == 200

    def test_header_name_is_case_insensitive(self):
        res = send(lead_payload(LEAD_CREATED), header="x-webhook-secret")
        assert res.status_code == 200

    def test_uses_configured_header_name(self):
        os.environ["MARKETO_WEBHOOK_HEADER"] = "X-Acme-Token"
        assert send(lead_payload(LEAD_CREATED), header="X-Acme-Token").status_code == 200
        assert send(lead_payload(LEAD_CREATED)).status_code == 401

    def test_rejects_missing_secret(self):
        assert send(lead_payload(LEAD_CREATED), secret=None).status_code == 401

    def test_rejects_wrong_secret(self):
        assert send(lead_payload(LEAD_CREATED), secret="not-the-secret").status_code == 401

    def test_checks_secret_before_parsing(self):
        assert send("{not json", secret="wrong").status_code == 401

    def test_fails_closed_when_secret_unset(self):
        del os.environ["MARKETO_WEBHOOK_SECRET"]
        assert send(lead_payload(LEAD_CREATED)).status_code == 500

    def test_rejects_invalid_json(self):
        res = send(
            "email=amy%40example.com&id=1",
            content_type="application/x-www-form-urlencoded",
        )
        assert res.status_code == 400

    def test_rejects_missing_event(self):
        assert send({"lead": {"id": 1042}}).status_code == 400

    def test_acknowledges_unknown_event(self):
        assert send(lead_payload("lead_escalated")).status_code == 200


class TestDispatch:
    def test_recognises_both_events(self):
        assert asyncio.run(dispatch(lead_payload(LEAD_CREATED))) is True
        assert asyncio.run(dispatch(lead_payload(LEAD_UPDATED))) is True

    def test_unknown_event(self):
        assert asyncio.run(dispatch(lead_payload("something_else"))) is False

    def test_tolerates_missing_lead(self):
        assert asyncio.run(dispatch({"event": LEAD_CREATED})) is True


class TestDedupeKey:
    def test_combines_event_id_campaign(self):
        assert dedupe_key(lead_payload(LEAD_UPDATED)) == "lead_updated:1042:Webinar follow-up"

    def test_none_without_lead_id(self):
        assert dedupe_key({"event": LEAD_CREATED}) is None
