import json
import os

# Set test environment variables before importing the app
os.environ["GOVUK_NOTIFY_WEBHOOK_SECRET"] = "test_notify_bearer_token_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, classify_callback, verify_notify_request

client = TestClient(app)

SECRET = os.environ["GOVUK_NOTIFY_WEBHOOK_SECRET"]

# Built from the field tables in the GOV.UK Notify callback docs (not captured traffic).
DELIVERY_RECEIPT = {
    "id": "740e5834-3a29-46b4-9a6f-16142fde533a",
    "reference": "12345678",
    "to": "hello@gov.uk",
    "status": "delivered",
    "created_at": "2017-05-14T12:15:30.000000Z",
    "completed_at": "2017-05-14T12:15:30.000000Z",
    "sent_at": "2017-05-14T12:15:30.000000Z",
    "notification_type": "email",
    "template_id": "1d8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d10",
    "template_version": 1,
}

RECEIVED_TEXT = {
    "id": "1e8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d11",
    "source_number": "447700912345",
    "destination_number": "07700987654",
    "message": "Hello Notify!",
    "date_received": "2017-05-14T12:15:30.000000Z",
}

RETURNED_LETTER = {
    "notification_id": "2f8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d12",
    "reference": "12345678",
    "date_sent": "2017-05-14T12:15:30.000000Z",
    "sent_by": "hello@gov.uk",
    "template_name": "Template name",
    "template_id": "1d8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d10",
    "template_version": 1,
    "spreadsheet_file_name": "contact_list.csv",
    "spreadsheet_row_number": 2,
    "upload_letter_file_name": None,
}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(DELIVERY_RECEIPT)
    return client.post(
        "/webhooks/govuk-notify",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def bearer(token=SECRET, scheme="Bearer"):
    return {"Authorization": f"{scheme} {token}"}


class TestBearerVerification:
    def test_accepts_correct_token(self):
        res = post(bearer())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("scheme", ["bearer", "BEARER", "BeArEr"])
    def test_scheme_is_case_insensitive(self, scheme):
        assert post(bearer(SECRET, scheme)).status_code == 200

    def test_token_is_case_sensitive(self):
        assert post(bearer(SECRET.upper())).status_code == 401

    def test_rejects_wrong_token_same_length(self):
        assert post(bearer("x" * len(SECRET))).status_code == 401

    def test_rejects_token_of_different_length(self):
        assert post(bearer("short")).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_bare_token_without_scheme(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_rejects_other_scheme(self):
        assert post(bearer(SECRET, "Basic")).status_code == 401

    def test_rejects_empty_token(self):
        assert post({"Authorization": "Bearer "}).status_code == 401

    def test_does_not_trim_token(self):
        assert post({"Authorization": f"Bearer  {SECRET}"}).status_code == 401

    def test_rejects_before_parsing_body(self):
        assert post(body="not json").status_code == 401


class TestConfiguredSecret:
    def test_strips_bearer_prefix_from_configured_value(self):
        headers = {"authorization": f"Bearer {SECRET}"}
        assert verify_notify_request(headers, f"Bearer {SECRET}") is True
        assert verify_notify_request(headers, f"bearer {SECRET}") is True

    def test_does_not_trim_configured_secret(self):
        assert verify_notify_request({"authorization": f"Bearer {SECRET}"}, f" {SECRET}") is False

    def test_fails_closed_when_unconfigured_or_empty(self):
        assert verify_notify_request({"authorization": "Bearer abc"}, "") is False
        assert verify_notify_request({"authorization": "Bearer "}, "Bearer ") is False

    def test_handles_non_ascii_tokens(self):
        assert verify_notify_request({"authorization": "Bearer pässword"}, "pässword") is True
        assert verify_notify_request({"authorization": "Bearer password"}, "pässword") is False
        assert verify_notify_request({"authorization": "Bearer pässword"}, "password") is False


class TestCallbackKinds:
    def test_classifies_by_shape(self):
        assert classify_callback(DELIVERY_RECEIPT) == "delivery_receipt"
        assert classify_callback(RECEIVED_TEXT) == "received_text"
        assert classify_callback(RETURNED_LETTER) == "returned_letter"
        assert classify_callback({"hello": "world"}) == "unknown"

    @pytest.mark.parametrize(
        "payload",
        [
            DELIVERY_RECEIPT,
            {**DELIVERY_RECEIPT, "status": "permanent-failure"},
            {**DELIVERY_RECEIPT, "status": "temporary-failure"},
            {**DELIVERY_RECEIPT, "status": "technical-failure"},
            RECEIVED_TEXT,
            RETURNED_LETTER,
            {"hello": "world"},
        ],
    )
    def test_handles_each_kind(self, payload):
        assert post(bearer(), body=json.dumps(payload)).status_code == 200


class TestRequestBody:
    def test_accepts_any_content_type(self):
        assert post(bearer(), content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400(self):
        assert post(bearer(), body="not json").status_code == 400

    def test_non_object_returns_400(self):
        assert post(bearer(), body="[1,2]").status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
