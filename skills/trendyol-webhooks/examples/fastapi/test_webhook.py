import json
import os

# Set test environment variables before importing the app
os.environ["TRENDYOL_WEBHOOK_SECRET"] = "test_trendyol_api_key_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_trendyol_request

client = TestClient(app)

SECRET = os.environ["TRENDYOL_WEBHOOK_SECRET"]

STATUSES = [
    "CREATED", "PICKING", "INVOICED", "SHIPPED", "CANCELLED", "DELIVERED", "UNDELIVERED",
    "RETURNED", "UNSUPPLIED", "AWAITING", "UNPACKED", "AT_COLLECTION_POINT", "VERIFIED",
]


def sample_package(status="Created"):
    return {
        "orderNumber": "10654411111",
        "shipmentPackageId": 3330111111,
        "status": status,
        "shipmentPackageStatus": status,
        "cargoProviderName": "Trendyol Express",
        "lines": [{"lineId": 4765111111, "quantity": 1, "orderLineItemStatusName": status}],
    }


def sample_payload(status="Created"):
    return {"totalElements": 1, "totalPages": 1, "page": 0, "size": 1, "content": [sample_package(status)]}


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/trendyol", content=body, headers=all_headers)


class TestApiKeyVerification:
    def test_accepts_correct_key(self):
        res = post(headers={"x-api-key": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_header_name_case_insensitively(self):
        res = post(headers={"X-API-KEY": SECRET})
        assert res.status_code == 200

    def test_rejects_wrong_key_of_same_length(self):
        res = post(headers={"x-api-key": "x" * len(SECRET)})
        assert res.status_code == 401

    def test_rejects_key_of_different_length(self):
        res = post(headers={"x-api-key": "short"})
        assert res.status_code == 401

    def test_rejects_key_that_only_starts_with_secret(self):
        res = post(headers={"x-api-key": SECRET + "-extra"})
        assert res.status_code == 401

    def test_rejects_missing_key(self):
        assert post().status_code == 401

    def test_rejects_empty_key(self):
        assert post(headers={"x-api-key": ""}).status_code == 401

    def test_does_not_accept_authorization_header(self):
        assert post(headers={"Authorization": SECRET}).status_code == 401

    def test_rejects_everything_when_unconfigured(self):
        assert verify_trendyol_request({"x-api-key": SECRET}, "") is False

    def test_non_ascii_key_does_not_raise(self):
        # Starlette decodes header bytes as latin-1; compare_digest runs on encoded bytes
        key = "anahtar-çö"
        assert verify_trendyol_request({"x-api-key": key}, key) is True
        assert verify_trendyol_request({"x-api-key": "anahtar-co"}, key) is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = post(headers={"x-api-key": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post(body="not json", headers={"x-api-key": SECRET}).status_code == 400

    def test_content_not_a_list_returns_400(self):
        res = post(body=json.dumps({"content": {}}), headers={"x-api-key": SECRET})
        assert res.status_code == 400

    def test_checks_key_before_parsing_body(self):
        assert post(body="not json").status_code == 401

    def test_empty_content_page(self):
        res = post(body=json.dumps({"content": []}), headers={"x-api-key": SECRET})
        assert res.status_code == 200


class TestStatusDispatch:
    @pytest.mark.parametrize("status", STATUSES)
    def test_handles_status(self, status, capsys):
        res = post(body=json.dumps(sample_payload(status)), headers={"x-api-key": SECRET})
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_status_is_case_insensitive(self, capsys):
        res = post(body=json.dumps(sample_payload("Delivered")), headers={"x-api-key": SECRET})
        assert res.status_code == 200
        assert "Package delivered" in capsys.readouterr().out

    def test_handles_every_package_in_content(self, capsys):
        body = {"content": [sample_package("Created"), sample_package("Shipped")]}
        res = post(body=json.dumps(body), headers={"x-api-key": SECRET})
        assert res.status_code == 200
        out = capsys.readouterr().out
        assert "Package created" in out and "Package shipped" in out

    def test_unknown_status_still_returns_200(self, capsys):
        res = post(body=json.dumps(sample_payload("Mystery")), headers={"x-api-key": SECRET})
        assert res.status_code == 200
        assert "Unhandled package status" in capsys.readouterr().out


def test_health():
    assert client.get("/health").status_code == 200
