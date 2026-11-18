# Generated with: zoho-crm-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

import pytest

# Test-only values. In Zoho these are the Custom Parameter's name and value.
HEADER = "X-Webhook-Secret"
SECRET = "zcrm-test-secret-6f1c2a9d4b7e"

os.environ["ZOHO_CRM_WEBHOOK_HEADER"] = HEADER
os.environ["ZOHO_CRM_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, parse_body, verify_zoho_crm_request  # noqa: E402

client = TestClient(app)

LEAD_BODY = json.dumps(
    {"module": "Leads", "id": "5725767000000412001", "last_name": "Lovelace", "email": "ada@example.com"}
)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("ZOHO_CRM_WEBHOOK_HEADER", HEADER)
    monkeypatch.setenv("ZOHO_CRM_WEBHOOK_SECRET", SECRET)


def post(body, headers, method="POST"):
    return client.request(method, "/webhooks/zoho-crm", content=body, headers=headers)


def test_verify_accepts_exact_value_only():
    assert verify_zoho_crm_request({HEADER: SECRET}, HEADER, SECRET)
    assert not verify_zoho_crm_request({HEADER: "nope"}, HEADER, SECRET)
    assert not verify_zoho_crm_request({}, HEADER, SECRET)
    assert not verify_zoho_crm_request({HEADER: SECRET}, HEADER, "")


def test_verify_handles_non_ascii():
    assert verify_zoho_crm_request({HEADER: "clé-secrète"}, HEADER, "clé-secrète")
    assert not verify_zoho_crm_request({HEADER: "clé"}, HEADER, "clé-secrète")


def test_parse_body_formats():
    assert parse_body(LEAD_BODY, "application/json")[0] == "json"
    assert parse_body("module=Deals&id=1", "application/x-www-form-urlencoded") == (
        "form",
        {"module": "Deals", "id": "1"},
    )
    assert parse_body('<lead id="1"/>', "application/xml")[0] == "text"
    assert parse_body("", "text/plain") == ("empty", None)
    assert parse_body("{bad", "application/json") is None


def test_accepts_post_with_raw_json(caplog):
    caplog.set_level("INFO")
    res = post(LEAD_BODY, {"content-type": "application/json", HEADER: SECRET})
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert "Lead 5725767000000412001 changed" in caplog.text


def test_accepts_put():
    res = post(LEAD_BODY, {"content-type": "application/json", HEADER: SECRET}, method="PUT")
    assert res.status_code == 200


def test_accepts_form_encoded(caplog):
    caplog.set_level("INFO")
    res = post(
        "module=Deals&id=5725767000000412077&stage=Closed+Won",
        {"content-type": "application/x-www-form-urlencoded", HEADER: SECRET},
    )
    assert res.status_code == 200
    assert "stage: Closed Won" in caplog.text


def test_accepts_raw_xml():
    res = post("<lead><id>1</id></lead>", {"content-type": "application/xml", HEADER: SECRET})
    assert res.status_code == 200


def test_header_lookup_is_case_insensitive():
    res = post(LEAD_BODY, {"content-type": "application/json", "x-webhook-secret": SECRET})
    assert res.status_code == 200


def test_custom_header_name(monkeypatch):
    monkeypatch.setenv("ZOHO_CRM_WEBHOOK_HEADER", "X-Zoho-Token")
    assert post(LEAD_BODY, {"X-Zoho-Token": SECRET}).status_code == 200
    assert post(LEAD_BODY, {HEADER: SECRET}).status_code == 401


def test_rejects_missing_header():
    assert post(LEAD_BODY, {"content-type": "application/json"}).status_code == 401


def test_rejects_wrong_value():
    assert post(LEAD_BODY, {HEADER: "wrong-secret"}).status_code == 401


def test_compares_whole_value():
    assert post(LEAD_BODY, {HEADER: f"Bearer {SECRET}"}).status_code == 401


def test_rejects_malformed_json():
    res = post('{"module": "Leads",', {"content-type": "application/json", HEADER: SECRET})
    assert res.status_code == 400


def test_get_is_not_allowed():
    assert client.get("/webhooks/zoho-crm", headers={HEADER: SECRET}).status_code == 405


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("ZOHO_CRM_WEBHOOK_SECRET")
    assert post(LEAD_BODY, {HEADER: SECRET}).status_code == 500
