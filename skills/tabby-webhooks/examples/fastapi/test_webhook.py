import json
import os

# Set test environment variables before importing the app
os.environ["TABBY_WEBHOOK_HEADER"] = "X-Auth-Key"
os.environ["TABBY_WEBHOOK_SECRET"] = "Bearer test_tabby_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, safe_equal, verify_tabby_request

client = TestClient(app)

NAME = os.environ["TABBY_WEBHOOK_HEADER"]
SECRET = os.environ["TABBY_WEBHOOK_SECRET"]


def payment(status="authorized", **extra):
    return {
        "id": "pay_123", "created_at": "2021-09-14T13:08:54Z", "status": status, "is_test": False,
        "amount": "100", "currency": "SAR", "order": {"reference_id": "order-1"},
        "captures": [], "refunds": [], **extra,
    }


def dispute(status="pending"):
    return {
        "status": status, "dispute_id": "dsp_1", "payment_id": "pay_123", "currency": "SAR",
        "created_at": "2026-06-15T13:08:54Z",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(payment())
    return client.post(
        "/webhooks/tabby",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderVerification:
    def test_correct_header_returns_200(self):
        res = post({NAME: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-auth-key": SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer_prefix(self):
        assert post({NAME: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({NAME: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({NAME: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_other_header_name(self):
        assert post({"X-Other": SECRET}).status_code == 401

    def test_custom_header_name(self):
        assert verify_tabby_request({"X-Tabby-Key": "abc"}, "X-Tabby-Key", "abc")
        assert not verify_tabby_request({"X-Tabby-Key": "abd"}, "X-Tabby-Key", "abc")

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        assert not verify_tabby_request({NAME: SECRET}, NAME, "")
        monkeypatch.delenv("TABBY_WEBHOOK_SECRET")
        assert not verify_tabby_request({NAME: SECRET})

    def test_safe_equal_handles_non_ascii(self):
        assert safe_equal("pässword", "pässword")
        assert not safe_equal("pässword", "password")


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({NAME: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert post({NAME: SECRET}, body="{not json").status_code == 400

    def test_non_object_returns_400(self):
        assert post({NAME: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_returns_401(self):
        assert post(body="{not json").status_code == 401


class TestPaymentDispatch:
    @pytest.mark.parametrize(
        "body,expected",
        [
            (payment("authorized"), "Payment authorized"),
            (payment("authorized", captures=[{"id": "c1"}]), "Payment captured"),
            (payment("closed"), "Payment closed:"),
            (payment("closed", refunds=[{"id": "r1"}]), "Payment closed with refunds"),
            (payment("rejected"), "Payment rejected"),
            (payment("expired"), "Payment expired"),
        ],
    )
    def test_statuses(self, body, expected, capsys):
        res = post({NAME: SECRET}, body=json.dumps(body))
        assert res.status_code == 200
        assert expected in capsys.readouterr().out

    def test_unknown_status_is_acknowledged(self, capsys):
        res = post({NAME: SECRET}, body=json.dumps(payment("something_new")))
        assert res.status_code == 200
        assert "Unhandled payment status" in capsys.readouterr().out


class TestDisputeDispatch:
    @pytest.mark.parametrize(
        "status,expected",
        [
            ("pending", "Dispute opened"),
            ("arbitration", "Dispute in arbitration"),
            ("evidence_merchant", "Dispute evidence requested"),
            ("approved", "Dispute approved"),
            ("declined", "Dispute declined"),
            ("cancelled", "Dispute cancelled"),
        ],
    )
    def test_statuses(self, status, expected, capsys):
        res = post({NAME: SECRET}, body=json.dumps(dispute(status)))
        assert res.status_code == 200
        assert expected in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
