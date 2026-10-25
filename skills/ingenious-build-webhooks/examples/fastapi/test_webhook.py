import json
import os

# Set test environment variables before importing the app
os.environ["INGENIOUS_BUILD_WEBHOOK_HEADER"] = "Authorization"
os.environ["INGENIOUS_BUILD_WEBHOOK_SECRET"] = "Bearer test_ingenious_build_token_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, safe_equal, verify_ingenious_build_request

client = TestClient(app)

SECRET = os.environ["INGENIOUS_BUILD_WEBHOOK_SECRET"]

EVENTS = {
    "budget_exported_to_accounting": "budget",
    "budget_change_exported_to_accounting": "budget_change",
    "contract_exported_to_accounting": "contract",
    "contract_change_exported_to_accounting": "contract_change",
    "invoice_exported_to_accounting": "invoice",
}


def sample_payload(name="invoice_exported_to_accounting"):
    return {
        "name": name,
        "subject": EVENTS.get(name, "other"),
        "data": {"id": "507f1f77bcf86cd799439012", "invoice_number": "INV-123", "gross_value": "1000.00", "items": []},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/ingenious-build",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthHeaderVerification:
    def test_exact_header_value(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_whole_value_is_compared(self):
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_custom_header_name(self):
        assert verify_ingenious_build_request({"X-IB-Token": "s3cret"}, name="X-IB-Token", secret="s3cret") is True
        assert verify_ingenious_build_request({"Authorization": "s3cret"}, name="X-IB-Token", secret="s3cret") is False

    def test_unconfigured_secret_rejects_everything(self):
        headers = {"Authorization": SECRET}
        assert verify_ingenious_build_request(headers, secret="") is False
        assert verify_ingenious_build_request(headers, secret=SECRET) is True

    def test_non_ascii_does_not_raise(self):
        assert safe_equal("café", "cafe") is False
        assert safe_equal("café", "café") is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({"Authorization": SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("name", list(EVENTS))
    def test_handles_event(self, name, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(name)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
