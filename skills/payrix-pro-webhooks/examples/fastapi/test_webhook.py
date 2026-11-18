# Generated with: payrix-pro-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os

# Set test environment variables before importing the app
os.environ["PAYRIX_PRO_WEBHOOK_HEADER"] = "X-Payrix-Secret"
os.environ["PAYRIX_PRO_WEBHOOK_SECRET"] = "Bearer test_payrix_pro_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_body, verify_payrix_pro_request

client = TestClient(app)

HEADER = os.environ["PAYRIX_PRO_WEBHOOK_HEADER"]
SECRET = os.environ["PAYRIX_PRO_WEBHOOK_SECRET"]
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Placeholder bodies, not Payrix payloads: Payrix doesn't document the body shape.
SAMPLE_BODY = {"placeholder": "first test body"}
OTHER_BODY = {"placeholder": "second test body"}


def send(method="POST", headers=None, body=None, content_type="application/json"):
    h = dict(headers or {})
    kwargs = {}
    if body is not None:
        h["Content-Type"] = content_type
        kwargs["content"] = body
    return client.request(method, "/webhooks/payrix-pro", headers=h, **kwargs)


class TestCredentialCheck:
    def test_exact_value(self):
        res = send(headers={HEADER: SECRET}, body=json.dumps(SAMPLE_BODY))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        res = send(headers={HEADER.lower(): SECRET}, body=json.dumps(OTHER_BODY))
        assert res.status_code == 200

    def test_whole_value_compared_stripped_bearer_rejected(self):
        res = send(headers={HEADER: SECRET.replace("Bearer ", "")}, body=json.dumps(SAMPLE_BODY))
        assert res.status_code == 401

    def test_wrong_value_same_length(self):
        assert send(headers={HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert send(headers={HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert send(body=json.dumps(SAMPLE_BODY)).status_code == 401

    def test_fails_closed_without_secret(self):
        assert verify_payrix_pro_request({HEADER: "anything"}, secret="", header_name=HEADER) is False

    def test_non_ascii_values_do_not_raise(self):
        assert verify_payrix_pro_request({HEADER: "päss"}, secret="päss", header_name=HEADER) is True
        assert verify_payrix_pro_request({HEADER: "päss"}, secret="pass", header_name=HEADER) is False

    def test_defaults_header_name_to_authorization(self, monkeypatch):
        monkeypatch.delenv("PAYRIX_PRO_WEBHOOK_HEADER")
        assert verify_payrix_pro_request({"Authorization": SECRET}) is True


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_empty_body_with_credential(self, method):
        assert send(method, headers={HEADER: SECRET}).status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_checks_credential_first(self, method):
        assert send(method, headers={HEADER: "nope"}).status_code == 401


class TestBody:
    def test_form_and_text_bodies(self):
        form = send(headers={HEADER: SECRET}, body="placeholder=form-body",
                    content_type="application/x-www-form-urlencoded")
        assert form.status_code == 200
        text = send(headers={HEADER: SECRET}, body="hello", content_type="text/plain")
        assert text.status_code == 200

    def test_malformed_json_is_400(self):
        assert send(headers={HEADER: SECRET}, body="{not json").status_code == 400

    def test_authenticates_before_parsing(self):
        assert send(body="{not json").status_code == 401

    def test_parse_body(self):
        assert parse_body(b"a=1", "application/x-www-form-urlencoded") == ("a=1", None)
        assert parse_body(b"", "application/json") == (None, None)
        assert parse_body(b'{"a":1}', "application/vnd.api+json") == ({"a": 1}, None)
