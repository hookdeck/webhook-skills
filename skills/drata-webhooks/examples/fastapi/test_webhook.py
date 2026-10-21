import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient

# Drata does not publish a signing secret for workflow webhooks. The "secret" is a
# random value YOU put in the Send webhook step's custom headers; tests send it the same way.
SECRET = "3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e"
os.environ["DRATA_WEBHOOK_SECRET"] = SECRET
os.environ.pop("DRATA_WEBHOOK_HEADER", None)

from main import (  # noqa: E402
    CONTROL_EVIDENCE_LINKED,
    CONTROL_OWNER_UPDATED,
    KNOWN_EVENTS,
    app,
    dedupe_key,
    dispatch,
    verify_drata_secret,
)

client = TestClient(app)
PATH = "/webhooks/drata"


@pytest.fixture(autouse=True)
def _reset_env():
    os.environ["DRATA_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("DRATA_WEBHOOK_HEADER", None)
    yield
    os.environ["DRATA_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("DRATA_WEBHOOK_HEADER", None)


def control_payload(event_type, **overrides):
    """Flat body as described in Drata's help center."""
    payload = {
        "event_type": event_type,
        "timestamp": "2026-10-21T09:30:00.000Z",
        "organization_id": "org_123",
        "workspace": {"id": 1, "name": "Main"},
        "control_id": 42,
        "control_code": "DCF-101",
        "control_name": "Access reviews performed quarterly",
        "control_owners": [{"name": "Amy Doe", "email": "amy@example.com"}],
        "evidence_name": "Q3 access review",
        "test_name": "MFA enabled",
        "updated_by": "Amy Doe",
    }
    payload.update(overrides)
    return payload


def send(body, header="X-Webhook-Secret", secret=SECRET, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if secret is not None:
        headers[header] = secret
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(PATH, content=data, headers=headers)


class TestVerifyDrataSecret:
    def test_accepts_matching_secret(self):
        assert verify_drata_secret(SECRET) is True

    def test_rejects_wrong_secret_of_same_length(self):
        assert verify_drata_secret("0" * len(SECRET)) is False

    def test_rejects_length_mismatch(self):
        assert verify_drata_secret(SECRET + "0") is False
        assert verify_drata_secret("short") is False

    def test_rejects_missing_header(self):
        assert verify_drata_secret(None) is False

    def test_fails_closed_when_secret_unset(self):
        del os.environ["DRATA_WEBHOOK_SECRET"]
        with pytest.raises(RuntimeError, match="DRATA_WEBHOOK_SECRET"):
            verify_drata_secret(SECRET)


class TestWebhookEndpoint:
    @pytest.mark.parametrize("event_type", sorted(KNOWN_EVENTS))
    def test_accepts_every_control_event(self, event_type):
        res = send(control_payload(event_type))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_header_name_case_insensitively(self):
        res = send(control_payload(CONTROL_EVIDENCE_LINKED), header="x-webhook-secret")
        assert res.status_code == 200

    def test_uses_custom_header_name_when_set(self):
        os.environ["DRATA_WEBHOOK_HEADER"] = "X-Acme-Token"
        ok = send(control_payload(CONTROL_EVIDENCE_LINKED), header="X-Acme-Token")
        assert ok.status_code == 200
        wrong_header = send(control_payload(CONTROL_EVIDENCE_LINKED))
        assert wrong_header.status_code == 401

    def test_rejects_missing_secret_header(self):
        res = send(control_payload(CONTROL_EVIDENCE_LINKED), secret=None)
        assert res.status_code == 401

    def test_rejects_wrong_secret(self):
        res = send(control_payload(CONTROL_EVIDENCE_LINKED), secret="not-the-secret")
        assert res.status_code == 401

    def test_checks_secret_before_parsing_body(self):
        res = send("{not json", secret="wrong")
        assert res.status_code == 401

    def test_fails_closed_when_secret_not_configured(self):
        del os.environ["DRATA_WEBHOOK_SECRET"]
        res = send(control_payload(CONTROL_EVIDENCE_LINKED))
        assert res.status_code == 500

    def test_invalid_json_returns_400(self):
        assert send("{not json").status_code == 400

    def test_missing_event_type_returns_400(self):
        assert send({"control_id": 42}).status_code == 400

    def test_unknown_event_is_acknowledged(self):
        res = send(control_payload("RISK_TREATMENT_CHANGED"))
        assert res.status_code == 200

    def test_accepts_body_without_json_content_type(self):
        res = send(control_payload(CONTROL_OWNER_UPDATED), content_type="text/plain")
        assert res.status_code == 200


class TestDispatch:
    def test_recognises_every_control_event(self):
        for event_type in KNOWN_EVENTS:
            assert asyncio.run(dispatch(control_payload(event_type))) is True

    def test_returns_false_for_unknown_event(self):
        assert asyncio.run(dispatch(control_payload("SOMETHING_ELSE"))) is False


class TestDedupeKey:
    def test_combines_event_type_control_id_and_timestamp(self):
        assert (
            dedupe_key(control_payload(CONTROL_EVIDENCE_LINKED))
            == "CONTROL_EVIDENCE_LINKED:42:2026-10-21T09:30:00.000Z"
        )

    def test_returns_none_without_control_id(self):
        assert dedupe_key({"event_type": CONTROL_EVIDENCE_LINKED}) is None
