import json
import os

# Set test environment variables before importing the app
os.environ["CLICKHOUSE_WEBHOOK_HEADER"] = "X-ClickStack-Secret"
os.environ["CLICKHOUSE_WEBHOOK_SECRET"] = "Bearer test_clickhouse_secret_0123456789"

from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_clickhouse_request

client = TestClient(app)

HEADER = os.environ["CLICKHOUSE_WEBHOOK_HEADER"]
SECRET = os.environ["CLICKHOUSE_WEBHOOK_SECRET"]

# Illustrative payload from the template {"title": "{{title}}", "body": "{{body}}", "link": "{{link}}"}
SAMPLE = {
    "title": "High error rate",
    "body": "Alert fired: error count >= 100 over 5m",
    "link": "https://clickstack.example.com/search/abc123",
}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(SAMPLE)
    return client.post(
        "/webhooks/clickhouse",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_whole_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_does_not_strip_bearer_prefix(self):
        assert post({HEADER: SECRET.removeprefix("Bearer ")}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_in_other_header_is_ignored(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_header_value_is_rejected_not_500(self):
        res = client.post(
            "/webhooks/clickhouse",
            content=json.dumps(SAMPLE),
            headers={HEADER: "café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_defaults_to_authorization_header(self):
        env = {"CLICKHOUSE_WEBHOOK_SECRET": "Bearer abc"}
        assert verify_clickhouse_request(Headers({"authorization": "Bearer abc"}), env) is True
        assert verify_clickhouse_request(Headers({"authorization": "abc"}), env) is False

    def test_rejects_everything_when_secret_unset(self):
        assert verify_clickhouse_request(Headers({HEADER: SECRET}), {}) is False
        assert verify_clickhouse_request(Headers({HEADER: ""}), {"CLICKHOUSE_WEBHOOK_SECRET": ""}) is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_accepts_non_json_body_as_plain_text(self, capsys):
        res = post({HEADER: SECRET}, body="High error rate - see link", content_type="text/plain")
        assert res.status_code == 200
        assert "High error rate - see link" in capsys.readouterr().out

    def test_accepts_empty_body(self):
        assert post({HEADER: SECRET}, body="", content_type="text/plain").status_code == 200

    def test_bad_body_without_header_is_401(self):
        assert post(body="{not json").status_code == 401

    def test_logs_title_body_and_link(self, capsys):
        assert post({HEADER: SECRET}).status_code == 200
        out = capsys.readouterr().out
        assert "High error rate" in out
        assert "https://clickstack.example.com/search/abc123" in out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
