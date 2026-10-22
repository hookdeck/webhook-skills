import base64
import json
import os

# Set test environment variables before importing the app
os.environ["JUMPCLOUD_WEBHOOK_USERNAME"] = "jc_channel_user"
os.environ["JUMPCLOUD_WEBHOOK_PASSWORD"] = "p@ss:word:with:colons"

from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_jumpcloud_request

client = TestClient(app)

USER = os.environ["JUMPCLOUD_WEBHOOK_USERNAME"]
PASS = os.environ["JUMPCLOUD_WEBHOOK_PASSWORD"]


def basic(user, password, scheme="Basic"):
    return f"{scheme} " + base64.b64encode(f"{user}:{password}".encode()).decode()


# Illustrative only: JumpCloud documents the field names, not an example body.
def sample_payload():
    return {
        "alert_id": "alert-0001",
        "alert_title": "Illustrative alert",
        "category": "illustrative",
        "di_event": "illustrative_event",
        "event_description": "Illustrative description",
        "priority": "High",
        "rule_id": "rule-0001",
        "status": "Open",
        "occurred_at": "2026-01-01T00:00:00Z",
    }


def post(auth=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    headers = {"Content-Type": content_type}
    if auth is not None:
        headers["Authorization"] = auth
    return client.post("/webhooks/jumpcloud", content=content, headers=headers)


class TestBasicAuthentication:
    def test_accepts_correct_credentials(self):
        res = post(basic(USER, PASS))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post(basic(USER, PASS, "basic")).status_code == 200

    def test_splits_on_first_colon_only(self):
        assert parse_basic_auth(basic("a", "b:c:d")) == (b"a", b"b:c:d")

    def test_rejects_wrong_password(self):
        assert post(basic(USER, "wrong")).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(basic("someone", PASS)).status_code == 401

    def test_rejects_both_wrong(self):
        assert post(basic("x", "y")).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(f"Bearer {PASS}").status_code == 401

    def test_rejects_malformed_values(self):
        no_colon = "Basic " + base64.b64encode(b"nocolon").decode()
        assert post(no_colon).status_code == 401
        assert post("Basic !!!").status_code == 401

    def test_fails_closed_when_unconfigured(self):
        headers = {"authorization": basic("", "")}
        assert verify_jumpcloud_request(headers, "", "") is False
        assert verify_jumpcloud_request({"authorization": basic(USER, PASS)}, "", "") is False

    def test_non_ascii_credentials_do_not_raise(self):
        headers = {"authorization": basic("üser", "pässwörd")}
        assert verify_jumpcloud_request(headers, "üser", "pässwörd") is True
        assert verify_jumpcloud_request(headers, "user", "pässwörd") is False


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post(basic(USER, PASS), content_type="text/plain").status_code == 200

    def test_bad_credentials_win_over_invalid_body(self):
        assert post(basic(USER, "wrong"), body="not json").status_code == 401

    def test_invalid_json_returns_400(self):
        assert post(basic(USER, PASS), body="not json").status_code == 400

    def test_json_array_returns_400(self):
        assert post(basic(USER, PASS), body="[1,2]").status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
