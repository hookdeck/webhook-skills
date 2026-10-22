import json
import os

# Set test environment variables before importing the app
os.environ["FRESHSALES_WEBHOOK_SECRET"] = "a3f9c0e17b2d4c58b6e1f0a9d8c7b6a5"
os.environ.pop("FRESHSALES_WEBHOOK_HEADER", None)  # exercise the X-Webhook-Secret default

import pytest
from fastapi.testclient import TestClient

from main import app, handle_payload, verify_freshsales_request

client = TestClient(app)

SECRET = os.environ["FRESHSALES_WEBHOOK_SECRET"]
HEADER = "X-Webhook-Secret"

# Illustrative Advanced content: Freshsales sends whatever the workflow author writes.
DEAL = {"deal": {"id": "12345", "name": "Acme renewal", "amount": "5000", "stage": "Won"}}
CONTACT = {"contact": {"id": "678", "first_name": "Ada", "email": "ada@example.com"}}


def send(method, headers=None, body=None, content_type="application/json"):
    headers = dict(headers or {})
    kwargs = {}
    if body is not None:
        headers["Content-Type"] = content_type
        kwargs["content"] = body
    return client.request(method, "/webhooks/freshsales", headers=headers, **kwargs)


class TestSecretHeaderVerification:
    def test_accepts_correct_secret(self):
        res = send("POST", {HEADER: SECRET}, json.dumps(DEAL))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        res = send("POST", {"x-WEBHOOK-secret": SECRET}, json.dumps(DEAL))
        assert res.status_code == 200

    def test_compares_whole_value_including_bearer_prefix(self):
        headers = {"x-webhook-secret": f"Bearer {SECRET}"}
        assert verify_freshsales_request(headers, f"Bearer {SECRET}") is True
        assert verify_freshsales_request(headers, SECRET) is False
        assert verify_freshsales_request({"x-webhook-secret": SECRET}, f"Bearer {SECRET}") is False

    def test_rejects_wrong_secret_of_same_length(self):
        res = send("POST", {HEADER: "x" * len(SECRET)}, json.dumps(DEAL))
        assert res.status_code == 401

    def test_rejects_secret_of_different_length(self):
        res = send("POST", {HEADER: "short"}, json.dumps(DEAL))
        assert res.status_code == 401

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_freshsales_request({"x-webhook-secret": "sécrét-☃"}) is False
        assert verify_freshsales_request({"x-webhook-secret": SECRET}, "sécrét-☃") is False

    def test_rejects_missing_header(self):
        assert send("POST", {}, json.dumps(DEAL)).status_code == 401

    def test_rejects_secret_in_a_different_header(self):
        assert send("POST", {"Authorization": SECRET}, json.dumps(DEAL)).status_code == 401

    def test_rejects_everything_when_secret_unset(self):
        assert verify_freshsales_request({"x-webhook-secret": SECRET}, "") is False
        saved = os.environ.pop("FRESHSALES_WEBHOOK_SECRET")
        try:
            assert verify_freshsales_request({"x-webhook-secret": SECRET}) is False
        finally:
            os.environ["FRESHSALES_WEBHOOK_SECRET"] = saved

    def test_custom_header_name(self):
        assert verify_freshsales_request({"x-fs-key": SECRET}, SECRET, "X-FS-Key") is True
        assert verify_freshsales_request({"x-webhook-secret": SECRET}, SECRET, "X-FS-Key") is False


class TestRequestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_methods_with_body(self, method):
        assert send(method, {HEADER: SECRET}, json.dumps(DEAL)).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_accepts_methods_without_body(self, method):
        assert send(method, {HEADER: SECRET}).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_rejects_methods_without_secret(self, method):
        assert send(method).status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = send("POST", {HEADER: SECRET}, json.dumps(DEAL), "text/plain")
        assert res.status_code == 200

    def test_accepts_empty_post_body(self):
        assert send("POST", {HEADER: SECRET}, "").status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert send("POST", {HEADER: SECRET}, "{not json").status_code == 400

    def test_invalid_json_without_secret_returns_401(self):
        assert send("POST", {}, "{not json").status_code == 401


class TestPayloadHandling:
    def test_deal_body(self, capsys):
        send("POST", {HEADER: SECRET}, json.dumps(DEAL))
        assert "Deal webhook" in capsys.readouterr().out

    def test_contact_body(self, capsys):
        send("POST", {HEADER: SECRET}, json.dumps(CONTACT))
        assert "Contact webhook" in capsys.readouterr().out

    def test_other_shapes_are_acknowledged(self):
        assert send("POST", {HEADER: SECRET}, json.dumps({"anything": "else"})).status_code == 200
        assert handle_payload("POST", None) == "unknown"


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
