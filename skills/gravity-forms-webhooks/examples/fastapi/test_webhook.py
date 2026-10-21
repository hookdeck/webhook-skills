import json
import os
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

# Gravity Forms issues no signing secret and signs nothing. The secret is a random
# value you generate (openssl rand -hex 32) and add to the webhook feed as the
# Request Header "X-Webhook-Secret". Tests send that header instead of a signature.
SECRET = "f3a1c9e7b5d2804611223344556677889900aabbccddeeff0011223344556677"
os.environ["GRAVITY_FORMS_WEBHOOK_SECRET"] = SECRET

from main import (  # noqa: E402
    app,
    dedupe_key,
    field_values,
    parse_entry,
    processed,
    verify_gravity_forms_secret,
)

client = TestClient(app)

# "All Fields": the entry, keyed by field ID plus entry properties
ENTRY = {
    "id": "101",
    "form_id": "3",
    "date_created": "2026-10-21 10:15:30",
    "source_url": "https://example.com/contact/",
    "1": "Ada Lovelace",
    "2": "ada@example.com",
    "3.3": "Ada",
    "3.6": "Lovelace",
}


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv("GRAVITY_FORMS_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("GRAVITY_FORMS_WEBHOOK_HEADER", raising=False)
    processed.clear()


def post(body, headers=None, content_type="application/json"):
    if headers is None:
        headers = {"X-Webhook-Secret": SECRET}
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/gravity-forms",
        content=data,
        headers={"Content-Type": content_type, **headers},
    )


class TestVerifyGravityFormsSecret:
    def test_accepts_exact_secret(self):
        assert verify_gravity_forms_secret(SECRET, SECRET) is True

    def test_rejects_wrong_secret(self):
        assert verify_gravity_forms_secret("wrong", SECRET) is False

    def test_rejects_different_length_or_case(self):
        assert verify_gravity_forms_secret(SECRET + "0", SECRET) is False
        assert verify_gravity_forms_secret(SECRET.upper(), SECRET) is False

    def test_rejects_missing_header(self):
        assert verify_gravity_forms_secret(None, SECRET) is False

    def test_fails_closed_without_secret(self):
        assert verify_gravity_forms_secret("", "") is False
        assert verify_gravity_forms_secret("None", None) is False


class TestParseEntry:
    def test_parses_json(self):
        assert parse_entry(json.dumps(ENTRY).encode(), "application/json") == ENTRY

    def test_parses_urlencoded(self):
        body = urlencode(ENTRY).encode()
        assert parse_entry(body, "application/x-www-form-urlencoded") == ENTRY

    def test_rejects_non_object_json(self):
        with pytest.raises(ValueError):
            parse_entry(b"[1, 2]", "application/json")

    def test_field_values_by_field_id(self):
        assert field_values(ENTRY) == {
            "1": "Ada Lovelace",
            "2": "ada@example.com",
            "3.3": "Ada",
            "3.6": "Lovelace",
        }

    def test_dedupe_key(self):
        assert dedupe_key({"id": "7", "form_id": "3"}) == "3:7"
        assert dedupe_key({"1": "x"}) is None


class TestWebhookEndpoint:
    def test_200_for_authenticated_json_entry(self):
        res = post(ENTRY)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_200_for_authenticated_urlencoded_entry(self):
        res = post(urlencode(ENTRY), content_type="application/x-www-form-urlencoded")
        assert res.status_code == 200

    def test_accepts_select_fields_body_without_id(self):
        res = post({"name": "Grace Hopper", "email": "grace@example.com"})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_401_without_secret_header(self):
        assert post(ENTRY, headers={}).status_code == 401

    def test_401_for_wrong_secret(self):
        assert post(ENTRY, headers={"X-Webhook-Secret": "nope"}).status_code == 401

    def test_authenticates_before_parsing(self):
        assert post("{not json", headers={}).status_code == 401

    def test_400_for_invalid_json(self):
        assert post("{not json").status_code == 400

    def test_400_for_non_object_json(self):
        assert post("[1,2,3]").status_code == 400

    def test_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("GRAVITY_FORMS_WEBHOOK_SECRET")
        assert post(ENTRY).status_code == 500

    def test_honours_custom_header_name(self, monkeypatch):
        monkeypatch.setenv("GRAVITY_FORMS_WEBHOOK_HEADER", "X-Site-Token")
        assert post(ENTRY).status_code == 401
        assert post(ENTRY, headers={"X-Site-Token": SECRET}).status_code == 200

    def test_acknowledges_duplicate_entry_id(self):
        assert post(ENTRY).json() == {"received": True}
        res = post(ENTRY)
        assert res.status_code == 200
        assert res.json() == {"received": True, "duplicate": True}
