import json

import pytest
from fastapi.testclient import TestClient

from main import app, safe_equal, verify_truework_token

client = TestClient(app)

# Truework tokens are opaque strings copied from Developer Settings.
TOKEN = "tw_test_token_0123456789abcdef"

ORDER_COMPLETED = {
    "version": "2023-10-30",
    "hook": {"id": 1, "event": "order.completed", "target": "https://example.com/webhooks/truework"},
    "data": {"order_id": "ord_123"},
}
STATE_CHANGE = {
    "version": "2023-10-30",
    "hook": {"id": 2, "event": "verification_request.state.change", "target": "https://example.com/webhooks/truework"},
    "data": {"order_id": "ord_123", "verification_request_id": "vr_456", "state": "action-required", "metadata": {}},
}


@pytest.fixture(autouse=True)
def token(monkeypatch):
    monkeypatch.setenv("TRUEWORK_WEBHOOK_TOKEN", TOKEN)


def post(body, headers=None, content_type="application/json"):
    raw = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/truework",
        content=raw,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def test_accepts_order_completed():
    res = post(ORDER_COMPLETED, {"X-Truework-Token": TOKEN})
    assert res.status_code == 200
    assert res.json() == {"received": True, "event": "order.completed"}


def test_accepts_verification_request_state_change():
    res = post(STATE_CHANGE, {"X-Truework-Token": TOKEN})
    assert res.status_code == 200
    assert res.json()["event"] == "verification_request.state.change"


def test_verifies_regardless_of_content_type():
    assert post(ORDER_COMPLETED, {"X-Truework-Token": TOKEN}, "text/plain").status_code == 200


def test_accepts_unknown_events():
    res = post({"hook": {"event": "something.else"}, "data": {}}, {"X-Truework-Token": TOKEN})
    assert res.status_code == 200


def test_rejects_missing_token():
    assert post(ORDER_COMPLETED).status_code == 401


def test_rejects_wrong_token():
    assert post(ORDER_COMPLETED, {"X-Truework-Token": "nope"}).status_code == 401


def test_rejects_token_of_different_length():
    assert post(ORDER_COMPLETED, {"X-Truework-Token": TOKEN + "x"}).status_code == 401


def test_invalid_json_with_valid_token_is_400():
    assert post("{not json", {"X-Truework-Token": TOKEN}).status_code == 400


def test_fails_closed_without_configured_token(monkeypatch):
    monkeypatch.delenv("TRUEWORK_WEBHOOK_TOKEN")
    assert post(ORDER_COMPLETED, {"X-Truework-Token": ""}).status_code == 500


def test_empty_header_does_not_match_unset_token():
    assert verify_truework_token("", "") is None
    assert verify_truework_token(None, TOKEN) is False


def test_safe_equal():
    assert safe_equal("a", "a")
    assert not safe_equal("a", "b")
    assert not safe_equal(None, "a")
