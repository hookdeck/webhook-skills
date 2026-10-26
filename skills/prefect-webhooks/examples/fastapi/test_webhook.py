import os

HEADER = "X-Prefect-Secret"
SECRET = "Bearer test_prefect_secret_0123456789"

# Set test environment variables before importing the app
os.environ["PREFECT_WEBHOOK_HEADER"] = HEADER
os.environ["PREFECT_WEBHOOK_SECRET"] = SECRET

import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_prefect_request

client = TestClient(app)


# Illustrative template: {"subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}"}
def sample_payload(subject="Flow run my-run entered state Failed"):
    return {"subject": subject, "body": "Flow run failed: boom", "name": "my-webhook-block"}


def send(method="POST", headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        "/webhooks/prefect",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_accepts_exact_header_value(self):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_matches_header_name_case_insensitively(self):
        res = send(headers={HEADER.lower(): SECRET})
        assert res.status_code == 200

    def test_compares_whole_value_not_bearer_stripped(self):
        res = send(headers={HEADER: SECRET.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_wrong_value_same_length(self):
        res = send(headers={HEADER: "x" * len(SECRET)})
        assert res.status_code == 401

    def test_rejects_wrong_length_without_raising(self):
        res = send(headers={HEADER: "short"})
        assert res.status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_ignores_secret_under_other_header(self):
        assert send(headers={"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # Headers carry latin-1 bytes; compare_digest on str would raise TypeError.
        assert verify_prefect_request({HEADER: "café-secret"}, SECRET, HEADER) is False
        assert verify_prefect_request({HEADER: "café"}, "café", HEADER) is True

    def test_rejects_everything_when_secret_unset(self):
        headers = {HEADER: SECRET}
        assert verify_prefect_request(headers, "", HEADER) is False
        os.environ.pop("PREFECT_WEBHOOK_SECRET")
        try:
            assert verify_prefect_request(headers) is False
        finally:
            os.environ["PREFECT_WEBHOOK_SECRET"] = SECRET

    def test_defaults_header_name_to_authorization(self):
        os.environ.pop("PREFECT_WEBHOOK_HEADER")
        try:
            assert verify_prefect_request({"Authorization": SECRET}) is True
        finally:
            os.environ["PREFECT_WEBHOOK_HEADER"] = HEADER


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_methods_with_body(self, method):
        assert send(method, headers={HEADER: SECRET}).status_code == 200

    def test_accepts_get_with_empty_body(self):
        res = client.get("/webhooks/prefect", headers={HEADER: SECRET})
        assert res.status_code == 200

    def test_authenticates_get(self):
        assert client.get("/webhooks/prefect").status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = send(headers={HEADER: SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_form_encoded_body(self):
        res = send(
            headers={HEADER: SECRET},
            body="subject=Failed&body=boom&name=blk",
            content_type="application/x-www-form-urlencoded",
        )
        assert res.status_code == 200

    def test_accepts_empty_post_body(self):
        assert send(headers={HEADER: SECRET}, body="").status_code == 200

    def test_invalid_json_is_400_after_auth(self):
        assert send(headers={HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json_is_400(self):
        assert send(headers={HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert send(body="{not json").status_code == 401


class TestNotificationHandling:
    def test_logs_subject_body_and_name(self, capsys):
        res = send(headers={HEADER: SECRET})
        assert res.status_code == 200
        assert "my-webhook-block" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
