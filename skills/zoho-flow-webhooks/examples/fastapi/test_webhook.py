# Generated with: zoho-flow-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

import pytest

# Test-only values. In Zoho Flow these are the auth profile's Parameter Name
# and the key entered on the connection.
HEADER = "X-Webhook-Secret"
SECRET = "zflow-test-secret-3b8e0d71c5a2"

os.environ["ZOHO_FLOW_WEBHOOK_HEADER"] = HEADER
os.environ["ZOHO_FLOW_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, parse_payload, verify_zoho_flow_request  # noqa: E402

client = TestClient(app)

FORM_BODY = json.dumps(
    {
        "event": "form.submitted",
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "submitted_at": "2026-11-18T10:15:00Z",
    }
)
JSON = {"content-type": "application/json"}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("ZOHO_FLOW_WEBHOOK_HEADER", HEADER)
    monkeypatch.setenv("ZOHO_FLOW_WEBHOOK_SECRET", SECRET)


def send(method, body, headers, path="/webhooks/zoho-flow"):
    return client.request(method, path, content=body, headers=headers)


def test_verify_accepts_exact_value_only():
    assert verify_zoho_flow_request({HEADER: SECRET}, HEADER, SECRET)
    assert not verify_zoho_flow_request({HEADER: "nope"}, HEADER, SECRET)
    assert not verify_zoho_flow_request({}, HEADER, SECRET)
    assert not verify_zoho_flow_request({HEADER: SECRET}, HEADER, "")


def test_verify_handles_non_ascii():
    assert verify_zoho_flow_request({HEADER: "clé-secrète"}, HEADER, "clé-secrète")
    assert not verify_zoho_flow_request({HEADER: "clé"}, HEADER, "clé-secrète")


def test_parse_payload_formats():
    assert parse_payload(FORM_BODY, "application/json")[0] == "json"
    assert parse_payload("event=deal.won&deal_id=D-1", "application/x-www-form-urlencoded") == (
        "form",
        {"event": "deal.won", "deal_id": "D-1"},
    )
    assert parse_payload("hello", "text/plain")[0] == "text"
    assert parse_payload("", "", {"event": "deal.won"}) == ("query", {"event": "deal.won"})
    assert parse_payload("{bad", "application/json") is None


def test_accepts_post_with_json(caplog):
    caplog.set_level("INFO")
    res = send("POST", FORM_BODY, {**JSON, HEADER: SECRET})
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "Form submitted by ada@example.com" in caplog.text


@pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
def test_accepts_other_methods(method):
    assert send(method, FORM_BODY, {**JSON, HEADER: SECRET}).status_code == 200


def test_accepts_get_with_query_payload(caplog):
    caplog.set_level("INFO")
    res = client.get("/webhooks/zoho-flow?event=deal.won&deal_id=D-1042", headers={HEADER: SECRET})
    assert res.status_code == 200
    assert "Deal D-1042 won" in caplog.text


def test_accepts_form_encoded(caplog):
    caplog.set_level("INFO")
    res = send("POST", "event=deal.won&deal_id=D-7", {"content-type": "application/x-www-form-urlencoded", HEADER: SECRET})
    assert res.status_code == 200
    assert "Deal D-7 won" in caplog.text


def test_header_lookup_is_case_insensitive():
    assert send("POST", FORM_BODY, {**JSON, "x-webhook-secret": SECRET}).status_code == 200


def test_custom_header_name(monkeypatch):
    monkeypatch.setenv("ZOHO_FLOW_WEBHOOK_HEADER", "X-Api-Key")
    assert send("POST", FORM_BODY, {"X-Api-Key": SECRET}).status_code == 200
    assert send("POST", FORM_BODY, {HEADER: SECRET}).status_code == 401


def test_rejects_missing_header():
    assert send("POST", FORM_BODY, JSON).status_code == 401


def test_rejects_key_in_query_string():
    assert client.get(f"/webhooks/zoho-flow?{HEADER}={SECRET}").status_code == 401


def test_rejects_wrong_or_prefixed_value():
    assert send("POST", FORM_BODY, {HEADER: "wrong-secret"}).status_code == 401
    assert send("POST", FORM_BODY, {HEADER: f"Bearer {SECRET}"}).status_code == 401


def test_rejects_malformed_json():
    assert send("POST", '{"event":', {**JSON, HEADER: SECRET}).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("ZOHO_FLOW_WEBHOOK_SECRET")
    assert send("POST", FORM_BODY, {HEADER: SECRET}).status_code == 500
