# Generated with: strike-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import uuid

import pytest

# Synthetic subscription secret (Strike accepts any 10-50 character string you choose)
SECRET = "strike_test_subscription_secret_01"
os.environ["STRIKE_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from main import EVENT_RESOURCES, app, process_event, verify_strike_signature  # noqa: E402

client = TestClient(app)


def make_body(**overrides):
    event = {
        "id": str(uuid.uuid4()),
        "eventType": "invoice.updated",
        "webhookVersion": "v1",
        "data": {"entityId": "602cc206-6b4a-42dd-bc89-9a534bb04034", "changes": ["state"]},
        "created": "2026-11-20T18:15:00+01:00",
        "deliverySuccess": True,
    }
    event.update(overrides)
    # Compact JSON, as Strike sends it.
    return json.dumps(event, separators=(",", ":"))


def sign(body, key=SECRET):
    return hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-Webhook-Signature"] = signature
    return client.post("/webhooks/strike", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("STRIKE_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("STRIKE_WEBHOOK_SECRET_PREVIOUS", raising=False)
    monkeypatch.setenv("STRIKE_API_KEY", "test_api_key")
    main.seen_event_ids.clear()


@pytest.fixture
def fetched(monkeypatch):
    """Record fetch-back calls instead of calling the Strike API."""
    calls = []

    def fake_fetch(path, api_key):
        calls.append((path, api_key))
        return {"state": "PAID"}

    monkeypatch.setattr(main, "fetch_strike_entity", fake_fetch)
    return calls


# --- verify_strike_signature -------------------------------------------------

def test_hex_hmac_sha256_of_raw_body_is_accepted():
    body = make_body()
    assert verify_strike_signature(body, sign(body), [SECRET])


def test_base64_truncated_and_stripe_style_values_are_rejected():
    body = make_body()
    digest = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).digest()
    assert not verify_strike_signature(body, base64.b64encode(digest).decode(), [SECRET])
    assert not verify_strike_signature(body, sign(body)[:40], [SECRET])
    assert not verify_strike_signature(body, f"t=1,v1={sign(body)}", [SECRET])


def test_signature_over_reserialised_json_is_rejected():
    body = make_body()
    pretty = json.dumps(json.loads(body), indent=2)
    assert not verify_strike_signature(body, sign(pretty), [SECRET])


# --- POST /webhooks/strike ---------------------------------------------------

def test_valid_signature_is_accepted_and_entity_fetched(fetched):
    body = make_body()
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True, "id": json.loads(body)["id"], "eventType": "invoice.updated"}
    # BackgroundTasks run after the response; TestClient waits for them.
    assert fetched == [("/v1/invoices/602cc206-6b4a-42dd-bc89-9a534bb04034", "test_api_key")]


def test_every_documented_event_type_is_accepted(fetched):
    for event_type in EVENT_RESOURCES:
        body = make_body(eventType=event_type)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json()["eventType"] == event_type
    assert len(fetched) == 14


def test_unknown_event_type_returns_200_and_is_ignored(fetched):
    body = make_body(eventType="lightning-address.created")
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json()["ignored"] == "unknown eventType"
    assert fetched == []


def test_redelivered_event_is_deduped(fetched):
    body = make_body()
    post(body, sign(body))
    res = post(body, sign(body))
    assert res.json()["duplicate"] is True
    assert len(fetched) == 1


def test_non_v1_payload_is_acknowledged_not_processed(fetched):
    body = make_body(webhookVersion="v2")
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json()["ignored"] == "unsupported webhookVersion"
    assert fetched == []


def test_created_event_without_changes_is_handled(fetched):
    body = make_body(eventType="invoice.created", data={"entityId": "abc"})
    assert post(body, sign(body)).status_code == 200
    assert fetched == [("/v1/invoices/abc", "test_api_key")]


def test_previous_secret_is_accepted_during_rotation(monkeypatch, fetched):
    monkeypatch.setenv("STRIKE_WEBHOOK_SECRET", "strike_new_subscription_secret_02")
    monkeypatch.setenv("STRIKE_WEBHOOK_SECRET_PREVIOUS", SECRET)
    body = make_body()
    assert post(body, sign(body)).status_code == 200


def test_api_key_as_signing_key_is_rejected():
    body = make_body()
    assert post(body, sign(body, "test_api_key")).status_code == 401


def test_tampered_body_is_rejected():
    body = make_body()
    assert post(body.replace("invoice.updated", "payout.updated"), sign(body)).status_code == 401


def test_missing_header_is_rejected():
    assert post(make_body()).status_code == 401


def test_wrong_length_header_is_401_not_500():
    body = make_body()
    assert post(body, "abc").status_code == 401
    assert post(body, sign(body) + "00").status_code == 401
    assert post(body, "z" * 64).status_code == 401


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("STRIKE_WEBHOOK_SECRET")
    body = make_body()
    assert post(body, sign(body)).status_code == 401


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


# --- process_event (fetch-back) ----------------------------------------------

@pytest.mark.parametrize(
    "event_type,path",
    [
        ("payment-method.bank.updated", "/v1/payment-methods/bank/id-1"),
        ("payout-originator.created", "/v1/payout-originators/id-1"),
        ("currency-exchange-quote.updated", "/v1/currency-exchange-quotes/id-1"),
        ("deposit.updated", "/v1/deposits/id-1"),
        ("payment.created", "/v1/payments/id-1"),
        ("receive-request.receive-completed", "/v1/receive-requests/id-1"),
    ],
)
def test_fetch_back_paths(fetched, event_type, path):
    process_event({"id": "e1", "eventType": event_type, "webhookVersion": "v1", "data": {"entityId": "id-1"}})
    assert fetched == [(path, "test_api_key")]


def test_fetch_back_skipped_without_api_key(monkeypatch, fetched):
    monkeypatch.delenv("STRIKE_API_KEY")
    assert process_event({"id": "e1", "eventType": "invoice.updated", "data": {"entityId": "x"}}) is None
    assert fetched == []
