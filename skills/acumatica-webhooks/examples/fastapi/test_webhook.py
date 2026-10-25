import itertools
import json
import os

# Set test environment variables before importing the app
os.environ["ACUMATICA_WEBHOOK_HEADER"] = "X-Acumatica-Key"
os.environ["ACUMATICA_WEBHOOK_SECRET"] = "Bearer test_acumatica_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, classify_change, verify_acumatica_request

client = TestClient(app)

HEADER = os.environ["ACUMATICA_WEBHOOK_HEADER"]
SECRET = os.environ["ACUMATICA_WEBHOOK_SECRET"]

_counter = itertools.count(1)


def sample_payload(**overrides):
    payload = {
        "Inserted": [{"InventoryID": "AACOMPUT01", "StockItem": True, "ItemStatus": "Inactive"}],
        "Deleted": [{"InventoryID": "AACOMPUT01", "StockItem": True, "ItemStatus": "Active"}],
        "Query": "Stock Items: Last Modified Date",
        "CompanyId": "MyTenant",
        "Id": f"1af4d140-5321-41f2-a2ec-50b67f577c{next(_counter):02d}",
        "TimeStamp": 636295833829493672,
        "AdditionalInfo": {},
    }
    payload.update(overrides)
    return payload


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/acumatica",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.upper(): SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_of_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_secret_in_different_header(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_authenticates_before_parsing_body(self):
        assert post(body="not json").status_code == 401

    def test_non_ascii_header_does_not_crash(self):
        res = client.post(
            "/webhooks/acumatica",
            content=json.dumps(sample_payload()),
            headers={"Content-Type": "application/json", HEADER: "é".encode("latin-1")},
        )
        assert res.status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400(self):
        assert post({HEADER: SECRET}, body="not json").status_code == 400

    def test_json_array_returns_400(self):
        assert post({HEADER: SECRET}, body="[]").status_code == 400


class TestNotificationHandling:
    @pytest.mark.parametrize(
        "change,overrides",
        [
            ("inserted", {"Deleted": []}),
            ("deleted", {"Inserted": []}),
            ("updated", {}),
            ("empty", {"Inserted": [], "Deleted": []}),
        ],
    )
    def test_handles_change_types(self, change, overrides):
        payload = sample_payload(**overrides)
        assert classify_change(payload) == change
        assert post({HEADER: SECRET}, body=json.dumps(payload)).status_code == 200

    def test_duplicate_id_is_acknowledged(self):
        body = json.dumps(sample_payload())
        assert post({HEADER: SECRET}, body=body).status_code == 200
        assert post({HEADER: SECRET}, body=body).status_code == 200


class TestVerifyFunction:
    def test_defaults_header_name_to_authorization(self):
        env = {"ACUMATICA_WEBHOOK_SECRET": "Bearer abc"}
        assert verify_acumatica_request({"Authorization": "Bearer abc"}, env) is True

    def test_fails_closed_when_secret_unset(self):
        assert verify_acumatica_request({"Authorization": ""}, {}) is False
        assert verify_acumatica_request({}, {}) is False


def test_health():
    assert client.get("/health").status_code == 200
