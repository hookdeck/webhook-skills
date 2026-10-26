import json
import os

# Set test environment variables before importing the app
os.environ["INVOICE_NINJA_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["INVOICE_NINJA_WEBHOOK_SECRET"] = "test_invoice_ninja_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, detect_entity, safe_equal, verify_invoice_ninja_request

client = TestClient(app)

HEADER = os.environ["INVOICE_NINJA_WEBHOOK_HEADER"]
SECRET = os.environ["INVOICE_NINJA_WEBHOOK_SECRET"]
URL = "/webhooks/invoice-ninja"

INVOICE = {"id": "Opnel5aKBz", "number": "0001", "client_id": "Wpmbk5ezJn", "amount": 100,
           "line_items": [{"product_key": "x", "cost": 100, "quantity": 1}]}
PAYMENT = {"id": "AS3df3A", "number": "0002", "client_id": "Wpmbk5ezJn", "amount": 100,
           "applied": 100, "transaction_reference": "abc"}
CLIENT = {"id": "Wpmbk5ezJn", "name": "Acme", "contacts": [{"id": "c1", "email": "a@example.com"}]}

NO_BODY = object()


def send(method="POST", headers=None, body=None, content_type="application/json", query=""):
    headers = {HEADER: SECRET} if headers is None else headers
    kwargs = {"headers": dict(headers)}
    if body is not NO_BODY:
        content = body if body is not None else json.dumps(INVOICE)
        kwargs["content"] = content
        kwargs["headers"]["Content-Type"] = content_type
    return client.request(method, URL + query, **kwargs)


class TestSecretHeaderVerification:
    def test_accepts_correct_value(self):
        res = send()
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={"x-webhook-secret": SECRET}).status_code == 200

    def test_rejects_wrong_value_same_length(self):
        assert send(headers={HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_different_length_without_raising(self):
        assert send(headers={HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert send(headers={}).status_code == 401

    def test_rejects_secret_under_other_header_name(self):
        assert send(headers={"X-Other": SECRET}).status_code == 401

    @pytest.mark.parametrize("method", ["POST", "PUT"])
    def test_never_answers_404_405_410_for_bad_credentials(self, method):
        res = send(method, headers={})
        assert res.status_code == 401
        assert res.status_code not in (404, 405, 410)

    def test_non_ascii_value_does_not_raise(self):
        assert send(headers={HEADER: "é".encode("latin-1")}).status_code == 401


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT"])
    def test_accepts_body_methods(self, method):
        res = send(method)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_empty_post_body(self):
        assert send(body="").status_code == 200


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert send(content_type="text/plain").status_code == 200

    def test_invalid_json_returns_400(self):
        assert send(body="not json").status_code == 400

    def test_json_array_returns_400(self):
        assert send(body="[1,2]").status_code == 400

    def test_credential_checked_before_body(self):
        assert send(headers={}, body="not json").status_code == 401


class TestRouting:
    @pytest.mark.parametrize("event,body,expected", [
        ("create_invoice", INVOICE, "Invoice created"),
        ("create_payment", PAYMENT, "Payment created"),
        ("update_client", CLIENT, "Client updated"),
    ])
    def test_routes_by_url(self, capsys, event, body, expected):
        assert send(body=json.dumps(body), query=f"?event={event}").status_code == 200
        assert expected in capsys.readouterr().out

    def test_falls_back_to_entity_shape(self, capsys):
        send(body=json.dumps(PAYMENT))
        assert "Payment received" in capsys.readouterr().out

    def test_detect_entity(self):
        assert detect_entity(INVOICE) == "document"
        assert detect_entity(PAYMENT) == "payment"
        assert detect_entity(CLIENT) == "client"
        assert detect_entity({}) == "unknown"


class TestVerifyFunction:
    def test_compares_whole_value_including_bearer(self):
        assert verify_invoice_ninja_request({"authorization": "Bearer abc123"}, "Bearer abc123", "Authorization")
        assert not verify_invoice_ninja_request({"authorization": "abc123"}, "Bearer abc123", "Authorization")
        assert not verify_invoice_ninja_request({"authorization": "Bearer abc123"}, "abc123", "Authorization")

    def test_rejects_when_unconfigured(self):
        assert not verify_invoice_ninja_request({"authorization": "x"}, "", "Authorization")

    def test_safe_equal_handles_non_ascii(self):
        assert safe_equal("pässword", "pässword")
        assert not safe_equal("pässword", "password")
