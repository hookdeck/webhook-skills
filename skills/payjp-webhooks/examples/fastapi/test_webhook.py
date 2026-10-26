import itertools
import json
import os

# Set test environment variables before importing the app
os.environ["PAYJP_WEBHOOK_SECRET"] = "whook_a09d5c1c87be4e1590a9f16516"

import pytest
from fastapi.testclient import TestClient

from main import app, seen_events, verify_payjp_request

client = TestClient(app)

TOKEN = os.environ["PAYJP_WEBHOOK_SECRET"]
HEADER = "X-Payjp-Webhook-Token"

EVENTS = [
    "charge.succeeded", "charge.failed", "charge.updated", "charge.refunded", "charge.captured",
    "dispute.created", "customer.created", "customer.updated", "customer.deleted",
    "subscription.created", "subscription.renewed", "subscription.canceled", "transfer.succeeded",
]

_counter = itertools.count(1)


@pytest.fixture(autouse=True)
def clear_seen():
    seen_events.clear()


def sample_payload(event_type="charge.succeeded", event_id=None):
    """Based on the charge.succeeded example in PAY.JP's webhook guide."""
    return {
        "created": 1442212986,
        "data": {
            "amount": 5000,
            "amount_refunded": 0,
            "captured": True,
            "captured_at": 1442212986,
            "card": {"brand": "Visa", "id": "car_f0984a6f68a730b7e1814ceabfe1", "last4": "4242", "object": "card"},
            "created": 1442212986,
            "currency": "jpy",
            "customer": None,
            "failure_code": None,
            "id": "ch_bcb7776459913c743c20e9f9351d4",
            "livemode": False,
            "object": "charge",
            "paid": True,
            "refunded": False,
            "subscription": None,
        },
        "id": event_id or f"evnt_test_{next(_counter)}",
        "livemode": False,
        "object": "event",
        "pending_webhooks": 1,
        "type": event_type,
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/payjp",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestTokenVerification:
    def test_correct_token(self):
        res = post({HEADER: TOKEN})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-payjp-webhook-token": TOKEN}).status_code == 200

    def test_wrong_token_same_length(self):
        assert post({HEADER: "x" * len(TOKEN)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_token_with_extra_characters(self):
        assert post({HEADER: TOKEN + "-extra"}).status_code == 401

    def test_missing_token(self):
        assert post().status_code == 401

    def test_authorization_bearer_is_not_accepted(self):
        assert post({"Authorization": f"Bearer {TOKEN}"}).status_code == 401

    def test_no_secret_configured_rejects_everything(self):
        assert verify_payjp_request({"x-payjp-webhook-token": TOKEN}, "") is False

    def test_direct_verification(self):
        assert verify_payjp_request({"x-payjp-webhook-token": TOKEN}, TOKEN) is True
        assert verify_payjp_request({"x-payjp-webhook-token": "nope"}, TOKEN) is False
        assert verify_payjp_request({}, TOKEN) is False

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_payjp_request({"x-payjp-webhook-token": "トークン"}, "whook_ascii") is False
        assert verify_payjp_request({"x-payjp-webhook-token": "トークン"}, "トークン") is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({HEADER: TOKEN}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_after_auth(self):
        assert post({HEADER: TOKEN}, body="{not json").status_code == 400

    def test_json_that_is_not_an_event(self):
        assert post({HEADER: TOKEN}, body=json.dumps([1, 2])).status_code == 400

    def test_bad_token_with_invalid_body_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type):
        res = post({HEADER: TOKEN}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_unhandled_event_returns_200(self):
        res = post({HEADER: TOKEN}, body=json.dumps(sample_payload("plan.created")))
        assert res.status_code == 200

    def test_dedupes_repeated_event_id(self):
        body = json.dumps(sample_payload("charge.succeeded", "evnt_dup"))
        first = post({HEADER: TOKEN}, body=body)
        second = post({HEADER: TOKEN}, body=body)
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").status_code == 200
