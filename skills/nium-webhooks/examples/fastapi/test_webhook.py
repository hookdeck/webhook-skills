import json
import os

# Set test environment variables before importing the app
os.environ["NIUM_WEBHOOK_HEADER"] = "x-partner-key"
# The configured value includes a 'Bearer ' prefix: it is compared whole, never parsed.
os.environ["NIUM_WEBHOOK_SECRET"] = "Bearer test_nium_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_nium_request

client = TestClient(app)

HEADER = os.environ["NIUM_WEBHOOK_HEADER"]
SECRET = os.environ["NIUM_WEBHOOK_SECRET"]

TEMPLATES = [
    "CUSTOMER_STATUS_WEBHOOK", "CUSTOMER_ODD_STATUS_WEBHOOK", "CARD_CLIENT_KYB_STATUS_WEBHOOK",
    "REMIT_TRANSACTION_INITIATED_WEBHOOK", "REMIT_TRANSACTION_PAID_WEBHOOK",
    "REMIT_TRANSACTION_REJECTED_WEBHOOK", "REMIT_TRANSACTION_RETURNED_WEBHOOK",
    "FX_CONVERSION_COMPLETED_WEBHOOK", "FX_CONVERSION_FAILED_WEBHOOK", "FX_CONVERSION_CANCELLED_WEBHOOK",
    "CARD_POS_APPROVED_WEBHOOK", "CARD_ATM_APPROVED_WEBHOOK", "CARD_WALLET_FUNDING_WEBHOOK",
    "VIRTUAL_ACCOUNT_ASSIGNED_WEBHOOK", "INCOMING_FUNDS_WEBHOOK",
]
RFI_STATUSES = ["RFI_REQUESTED", "RFI_RESPONDED", "RFI_CLOSED"]


def sample_payload(template="REMIT_TRANSACTION_PAID_WEBHOOK"):
    return {
        "clientHashId": "0498f10f-1968-494f-9f7a-454ed23942a0",
        "customerHashId": "0de1e512-e0d7-4eca-ad41-dd39325facc2",
        "walletHashId": "e83cca77-8b63-4a25-b580-1d872380ef29",
        "systemReferenceNumber": "RT1343085439",
        "template": template,
    }


def rfi_payload(status):
    return {
        "clientHashId": "b1cb53e3-6a1b-4b58-a10d-5a79c5967cef",
        "customerHashId": "85c21489-94aa-4e65-ab7e-1c6bcea84e27",
        "rfiDetails": {"rfiId": "rfi_7f3a9c12", "status": status, "query": "Please provide the source of funds."},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/nium",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestStaticHeaderAuthentication:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"X-Partner-Key": SECRET}).status_code == 200

    def test_whole_value_is_compared_including_bearer_prefix(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_other_header_is_not_accepted(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_is_rejected_not_an_error(self):
        # compare_digest on str raises TypeError for non-ASCII; the handler encodes to bytes first.
        assert post({HEADER: "caf\u00e9-secret".encode("utf-8")}).status_code == 401
        # Starlette decodes header bytes as latin-1.
        headers = Headers(raw=[(HEADER.encode(), "p\u00e4ssword".encode("latin-1"))])
        assert verify_nium_request(headers, secret="p\u00e4ssword") is True
        assert verify_nium_request(headers, secret="password") is False

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_nium_request(Headers({HEADER: SECRET}), secret="") is False
        assert verify_nium_request(Headers({HEADER: SECRET}), secret=SECRET) is True

    def test_user_chosen_header_name(self):
        assert verify_nium_request(Headers({"x-acme-token": SECRET}), SECRET, "X-Acme-Token") is True
        assert verify_nium_request(Headers({HEADER: SECRET}), SECRET, "X-Acme-Token") is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("template", TEMPLATES)
    def test_handles_template(self, template, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(template)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    @pytest.mark.parametrize("status", RFI_STATUSES)
    def test_handles_rfi_status(self, status, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(rfi_payload(status)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_template_is_acknowledged(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("SOMETHING_NEW_WEBHOOK")))
        assert res.status_code == 200
        assert "Unhandled event: SOMETHING_NEW_WEBHOOK" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
