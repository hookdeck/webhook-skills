import base64
import os

# Set test environment variables before importing the app
os.environ["BRAZE_WEBHOOK_USERNAME"] = "braze-user"
os.environ["BRAZE_WEBHOOK_PASSWORD"] = "p@ss:word-with-colon-0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_braze_request

client = TestClient(app)

USER = os.environ["BRAZE_WEBHOOK_USERNAME"]
PASS = os.environ["BRAZE_WEBHOOK_PASSWORD"]


def basic(u: str, p: str) -> str:
    return "Basic " + base64.b64encode(f"{u}:{p}".encode("utf-8")).decode()


GOOD = basic(USER, PASS)

# Illustrative body: Braze adds no event field, the marketer composes it.
BODY = '{"message_body": "Your order just arrived!", "user_id": "u_123"}'


def send(method, auth=None, body=None, content_type="application/json"):
    headers = {}
    if auth is not None:
        headers["Authorization"] = auth
    if body is not None:
        headers["Content-Type"] = content_type
    return client.request(method, "/webhooks/braze", content=body, headers=headers)


class TestBasicAuthVerification:
    def test_correct_credential(self):
        res = send("POST", GOOD, BODY)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert send("POST", GOOD.replace("Basic", "basic"), BODY).status_code == 200

    def test_splits_on_first_colon(self):
        assert parse_basic_auth(basic("a", "b:c:d")) == (b"a", b"b:c:d")

    def test_wrong_password_same_length(self):
        assert send("POST", basic(USER, "x" * len(PASS)), BODY).status_code == 401

    def test_wrong_username_right_password(self):
        assert send("POST", basic("other-user", PASS), BODY).status_code == 401

    def test_different_length_password(self):
        assert send("POST", basic(USER, "short"), BODY).status_code == 401

    def test_missing_header(self):
        res = send("POST", None, BODY)
        assert res.status_code == 401
        assert res.headers["www-authenticate"].startswith("Basic")

    def test_non_basic_scheme(self):
        assert send("POST", f"Bearer {PASS}", BODY).status_code == 401

    def test_no_colon(self):
        auth = "Basic " + base64.b64encode(b"nocolon").decode()
        assert send("POST", auth, BODY).status_code == 401

    def test_malformed_header(self):
        assert send("POST", "Basic", BODY).status_code == 401
        assert send("POST", "Basic !!!not-base64!!!", BODY).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        headers = {"authorization": basic("usér", "pässwörd")}
        assert verify_braze_request(headers, "usér", "pässwörd") is True
        assert verify_braze_request(headers, "usér", "password") is False
        # A non-ASCII credential from the sender against ASCII config must not raise either
        assert send("POST", basic("usér", "pässwörd"), BODY).status_code == 401

    def test_rejects_everything_when_unconfigured(self, monkeypatch):
        headers = {"authorization": GOOD}
        assert verify_braze_request(headers, "", "") is False
        assert verify_braze_request(headers, USER, "") is False
        monkeypatch.delenv("BRAZE_WEBHOOK_USERNAME")
        monkeypatch.delenv("BRAZE_WEBHOOK_PASSWORD")
        assert verify_braze_request(headers) is False


class TestHttpMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_method_with_json_body(self, method):
        assert send(method, GOOD, BODY).status_code == 200

    def test_accepts_get_without_body(self):
        assert send("GET", GOOD).status_code == 200

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "GET", "DELETE"])
    def test_requires_auth(self, method):
        assert send(method, None, None if method == "GET" else BODY).status_code == 401

    def test_other_methods_are_405(self):
        assert client.request("OPTIONS", "/webhooks/braze", headers={"Authorization": GOOD}).status_code == 405


class TestBodyHandling:
    def test_empty_post_body(self):
        assert send("POST", GOOD).status_code == 200

    @pytest.mark.parametrize(
        "body,content_type",
        [
            ("<order><status>arrived</status></order>", "application/xml"),
            ("to=%2B15551234567&text=Your+order+just+arrived", "application/x-www-form-urlencoded"),
            ("Hello {{first_name}}", "text/plain"),
            ("{not json", "application/json"),
            ("[1,2]", "application/json"),
        ],
    )
    def test_accepts_any_body(self, body, content_type):
        assert send("POST", GOOD, body, content_type).status_code == 200

    def test_garbage_without_credentials_is_401(self):
        assert send("POST", None, "{not json").status_code == 401

    def test_logs_each_body_kind(self, capsys):
        send("POST", GOOD, BODY)
        send("POST", GOOD, "plain text", "text/plain")
        send("GET", GOOD)
        out = capsys.readouterr().out
        assert "JSON body" in out and "text body" in out and "no body" in out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
