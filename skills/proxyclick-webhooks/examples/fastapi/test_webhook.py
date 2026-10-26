import base64
import json
import os

# Set test environment variables before importing the app
USERNAME = "proxyclick"
PASSWORD = "p@ss:word-with-colon"
os.environ["PROXYCLICK_WEBHOOK_USERNAME"] = USERNAME
os.environ["PROXYCLICK_WEBHOOK_PASSWORD"] = PASSWORD

from fastapi.testclient import TestClient

from main import app, parse_basic_auth, safe_equal, verify_proxyclick_request

client = TestClient(app)

# ILLUSTRATIVE body: Proxyclick's attribute reference is not documented here, so
# this is NOT its real schema. Only the Basic credential check is under test.
ILLUSTRATIVE = {"visitor": {"firstName": "Ada"}, "visit": {"id": "illustrative-1"}}


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(ILLUSTRATIVE)
    return client.post(
        "/webhooks/proxyclick",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestProxyclickWebhook:
    def test_accepts_correct_basic_credentials(self):
        res = post(headers={"Authorization": basic(USERNAME, PASSWORD)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lowercase_scheme_and_colon_in_password(self):
        res = post(headers={"Authorization": basic(USERNAME, PASSWORD).replace("Basic", "basic")})
        assert res.status_code == 200

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_password_and_username(self):
        assert post(headers={"Authorization": basic(USERNAME, "nope")}).status_code == 401
        assert post(headers={"Authorization": basic("other", PASSWORD)}).status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(headers={"Authorization": f"Bearer {PASSWORD}"}).status_code == 401

    def test_rejects_malformed_base64_and_missing_colon(self):
        assert post(headers={"Authorization": "Basic !!!notbase64"}).status_code == 401
        no_colon = "Basic " + base64.b64encode(b"justausername").decode()
        assert post(headers={"Authorization": no_colon}).status_code == 401

    def test_does_not_send_www_authenticate_challenge(self):
        assert "www-authenticate" not in post().headers

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(ILLUSTRATIVE), {"Authorization": basic(USERNAME, PASSWORD)}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_and_array_return_400(self):
        auth = {"Authorization": basic(USERNAME, PASSWORD)}
        assert post("not json", auth).status_code == 400
        assert post("[1,2]", auth).status_code == 400


class TestHelpers:
    def test_parse_basic_auth_splits_on_first_colon(self):
        assert parse_basic_auth(basic("a", "b:c")) == ("a", "b:c")
        assert parse_basic_auth(None) is None

    def test_safe_equal_handles_non_ascii(self):
        assert safe_equal("pässword", "pässword") is True
        assert safe_equal("pässword", "password") is False

    def test_non_ascii_credentials_do_not_raise(self):
        assert verify_proxyclick_request({"authorization": basic("üser", "pässword")}) is False

    def test_never_accepts_when_unconfigured(self):
        headers = {"authorization": basic(USERNAME, PASSWORD)}
        assert verify_proxyclick_request(headers, {}) is False
        assert verify_proxyclick_request(headers, {"PROXYCLICK_WEBHOOK_USERNAME": USERNAME}) is False
