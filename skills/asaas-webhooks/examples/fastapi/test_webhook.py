import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Asaas authTokens are 32-255 characters with no whitespace.
TOKEN = "test_asaas_auth_token_0123456789abcdef"
os.environ["ASAAS_WEBHOOK_TOKEN"] = TOKEN

from main import app  # noqa: E402

client = TestClient(app)


def payload(**overrides):
    body = {
        "id": f"evt_{uuid.uuid4().hex}",
        "event": "PAYMENT_RECEIVED",
        "dateCreated": "2024-06-12 16:45:03",
        "payment": {"object": "payment", "id": "pay_080225913252", "value": 100, "status": "RECEIVED"},
    }
    body.update(overrides)
    return json.dumps(body)


def send(body, token=TOKEN):
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["asaas-access-token"] = token
    return client.post("/webhooks/asaas", content=body, headers=headers)


def test_accepts_valid_token():
    res = send(payload())
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize(
    "event",
    ["PAYMENT_CREATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED"],
)
def test_handles_payment_events(event):
    assert send(payload(event=event)).status_code == 200


def test_handles_subscription_and_transfer_events():
    assert send(payload(event="SUBSCRIPTION_CREATED", subscription={"id": "sub_1"})).status_code == 200
    assert send(payload(event="TRANSFER_DONE", transfer={"id": "tra_1"})).status_code == 200


def test_accepts_unknown_events():
    assert send(payload(event="SOMETHING_NEW")).status_code == 200


def test_rejects_wrong_token():
    assert send(payload(), "wrong_token_wrong_token_wrong_token_00").status_code == 401


def test_rejects_token_of_different_length():
    assert send(payload(), "short").status_code == 401


def test_rejects_missing_token():
    assert send(payload(), None).status_code == 401


def test_rejects_invalid_json_after_valid_token():
    assert send("{not json").status_code == 400


def test_rejects_body_without_event():
    assert send(json.dumps({"id": "evt_x"})).status_code == 400


def test_flags_duplicate_event_ids():
    body = payload(id="evt_duplicate_1")
    first = send(body)
    second = send(body)
    assert first.json() == {"received": True}
    assert second.json() == {"received": True, "duplicate": True}


def test_returns_500_when_token_not_configured(monkeypatch):
    monkeypatch.delenv("ASAAS_WEBHOOK_TOKEN")
    assert send(payload()).status_code == 500
