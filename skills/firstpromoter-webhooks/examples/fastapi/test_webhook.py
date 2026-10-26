import json
import os

# Set test environment variables before importing the app
os.environ["FIRSTPROMOTER_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["FIRSTPROMOTER_WEBHOOK_SECRET"] = "Bearer test_firstpromoter_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, seen_events, verify_firstpromoter_request

client = TestClient(app)

HEADER = os.environ["FIRSTPROMOTER_WEBHOOK_HEADER"]
SECRET = os.environ["FIRSTPROMOTER_WEBHOOK_SECRET"]

# Payloads as shown in FirstPromoter's docs (https://docs.firstpromoter.com/webhooks-v2/payload)

PROMOTER_CREATED = {
    "event_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "event_type": "promoter.created",
    "action": "created",
    "entity_type": "promoter",
    "entity_id": 12345,
    "changes": {},
    "data": {
        "id": 12345,
        "email": "jane@example.com",
        "name": "Jane Smith",
        "cust_id": "cus_abc123",
        "balances": {},
        "joined_at": "2025-01-15T10:30:00Z",
        "profile": {
            "id": 98765,
            "first_name": "Jane",
            "last_name": "Smith",
            "website": "https://janesmith.com",
            "company_name": "",
            "phone_number": "",
            "address": "",
            "country": "US",
            "paypal_email": "",
            "avatar": ""
        }
    },
    "timestamp": "2025-01-15T10:30:00Z"
}

REFERRAL_UPDATED = {
    "event_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "event_type": "referral.updated",
    "action": "updated",
    "entity_type": "referral",
    "entity_id": 55678,
    "changes": {
        "state": [
            "signup",
            "active"
        ],
        "customer_since": [
            None,
            "2025-01-20T14:00:00Z"
        ]
    },
    "data": {
        "id": 55678,
        "state": "active",
        "email": "user@example.com",
        "uid": "user_ext_id",
        "customer_since": "2025-01-20T14:00:00Z",
        "fraud_check": "no_suspicion",
        "created_at": "2025-01-18T09:00:00Z"
    },
    "timestamp": "2025-01-20T14:00:05Z"
}

COMMISSION_UPDATED = {
    "event_id": "c3d4e5f6-a7b8-9012-cdef-012345678902",
    "event_type": "commission.updated",
    "action": "updated",
    "entity_type": "commission",
    "entity_id": 88901,
    "changes": {
        "status": [
            "pending",
            "approved"
        ]
    },
    "data": {
        "id": 88901,
        "status": "approved",
        "amount": 2500,
        "unit": "cash",
        "referral": {
            "id": 55678,
            "email": "user@example.com",
            "uid": "user_ext_id"
        },
        "created_at": "2025-01-18T09:00:00Z"
    },
    "timestamp": "2025-01-21T11:15:00Z"
}

CONTRACT_SIGNED = {
    "event_id": "d4e5f6a7-b8c9-0123-defa-123456789012",
    "event_type": "contract_document.signed",
    "action": "updated",
    "entity_type": "contract_document",
    "entity_id": 4421,
    "changes": {
        "signed_at": [
            None,
            "2025-01-22T08:45:00Z"
        ]
    },
    "data": {
        "id": 4421,
        "promoter_id": 12345,
        "signed_at": "2025-01-22T08:45:00Z",
        "created_at": "2025-01-10T12:00:00Z"
    },
    "timestamp": "2025-01-22T08:45:03Z"
}

DOCUMENTED = [PROMOTER_CREATED, REFERRAL_UPDATED, COMMISSION_UPDATED, CONTRACT_SIGNED]

EVENTS = [
    "promoter.created",
    "promoter.updated",
    "promoter.deleted",
    "promoter.balance.updated",
    "referral.created",
    "referral.updated",
    "referral.converted",
    "referral.cancelled",
    "referral.deleted",
    "referral.moved",
    "commission.created",
    "commission.updated",
    "commission.approved",
    "commission.pending",
    "commission.denied",
    "commission.deleted",
    "payout.created",
    "payout.completed",
    "payout.failed",
    "contract_document.signed",
]

_counter = 0


def sample_payload(event_type):
    global _counter
    _counter += 1
    entity, action = event_type.split(".")[0], event_type.split(".")[1]
    return {
        "event_id": f"00000000-0000-4000-8000-{_counter:012d}",
        "event_type": event_type,
        "action": action if action in ("created", "deleted") else "updated",
        "entity_type": entity,
        "entity_id": 1,
        "changes": {},
        "data": {"id": 1, "amount": 2500, "unit": "cash", "email": "user@example.com", "promoter_id": 12345},
        "timestamp": "2025-01-21T11:15:00Z",
    }


@pytest.fixture(autouse=True)
def clear_seen_events():
    seen_events.clear()


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PROMOTER_CREATED)
    return client.post(
        "/webhooks/firstpromoter",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_whole_value_is_compared_so_stripped_bearer_is_rejected(self):
        assert post({HEADER: SECRET.removeprefix("Bearer ")}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_in_a_different_header_is_not_accepted(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        headers = Headers({HEADER: SECRET})
        assert verify_firstpromoter_request(headers, secret="", name=HEADER) is False
        assert verify_firstpromoter_request(headers, secret=SECRET, name=HEADER) is True

    def test_non_ascii_value_is_compared_as_bytes(self):
        headers = Headers(raw=[(HEADER.lower().encode(), "pässword".encode("latin-1"))])
        assert verify_firstpromoter_request(headers, secret="pässword", name=HEADER) is True
        assert verify_firstpromoter_request(headers, secret="password", name=HEADER) is False

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("FIRSTPROMOTER_WEBHOOK_HEADER")
        assert verify_firstpromoter_request(Headers({"authorization": SECRET}), secret=SECRET) is True
        assert verify_firstpromoter_request(Headers({HEADER.lower(): SECRET}), secret=SECRET) is False


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("payload", DOCUMENTED, ids=lambda p: p["event_type"])
    def test_handles_documented_payload(self, payload, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(payload))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("payout_method.created")))
        assert res.status_code == 200
        assert "Unhandled event: payout_method.created" in capsys.readouterr().out

    def test_repeated_event_id_is_not_reprocessed(self, capsys):
        body = json.dumps(COMMISSION_UPDATED)
        first = post({HEADER: SECRET}, body=body)
        second = post({HEADER: SECRET}, body=body)
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Commission updated") == 1


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
