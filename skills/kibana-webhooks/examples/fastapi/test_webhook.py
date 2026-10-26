import base64
import json
import os

import pytest
from fastapi.testclient import TestClient

USERNAME = "kibana_user"
PASSWORD = "p@ss:word:with:colons"

os.environ["KIBANA_WEBHOOK_USERNAME"] = USERNAME
os.environ["KIBANA_WEBHOOK_PASSWORD"] = PASSWORD

from main import app, verify_basic_auth  # noqa: E402

client = TestClient(app)

METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Illustrative rule action template output (not a vendor schema)
FIRED = json.dumps({"rule": "High CPU", "status": "query matched", "context": "CPU above 90%"})
RECOVERED = json.dumps({"rule": "High CPU", "status": "recovered", "context": "CPU back to normal"})


def basic(user: str, pw: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()


def send(method, headers=None, body=None):
    headers = dict(headers or {})
    if body is not None:
        headers.setdefault("content-type", "application/json")
    return client.request(method, "/webhooks/kibana", headers=headers, content=body)


class TestBasicAuth:
    def test_accepts_valid_credentials(self):
        res = send("POST", {"Authorization": basic(USERNAME, PASSWORD)}, FIRED)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_scheme_in_any_case(self):
        header = basic(USERNAME, PASSWORD).replace("Basic", "bAsIc")
        assert send("POST", {"Authorization": header}, FIRED).status_code == 200

    def test_accepts_recovered(self):
        assert send("POST", {"Authorization": basic(USERNAME, PASSWORD)}, RECOVERED).status_code == 200

    def test_rejects_wrong_password(self):
        assert send("POST", {"Authorization": basic(USERNAME, "wrong")}, FIRED).status_code == 401

    def test_rejects_wrong_username(self):
        assert send("POST", {"Authorization": basic("other", PASSWORD)}, FIRED).status_code == 401

    def test_rejects_missing_header(self):
        assert send("POST", {}, FIRED).status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert send("POST", {"Authorization": "Bearer abc"}, FIRED).status_code == 401

    def test_rejects_malformed_base64(self):
        assert send("POST", {"Authorization": "Basic !!!not-base64!!!"}, FIRED).status_code == 401

    def test_rejects_valid_credentials_followed_by_junk(self):
        header = basic(USERNAME, PASSWORD) + "!!!!"
        assert send("POST", {"Authorization": header}, FIRED).status_code == 401

    def test_rejects_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"nocolon").decode()
        assert send("POST", {"Authorization": header}, FIRED).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        # compare_digest on str would raise TypeError for non-ASCII; bytes must not
        assert verify_basic_auth(basic("üser", "pässword")) is False

    def test_no_www_authenticate_challenge(self):
        res = send("POST", {}, FIRED)
        assert "www-authenticate" not in res.headers

    def test_rejects_everything_when_unconfigured(self, monkeypatch):
        monkeypatch.setenv("KIBANA_WEBHOOK_USERNAME", "")
        monkeypatch.setenv("KIBANA_WEBHOOK_PASSWORD", "")
        assert verify_basic_auth(basic("", "")) is False
        assert verify_basic_auth(basic(USERNAME, PASSWORD)) is False


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_method_with_json_body(self, method):
        res = send(method, {"Authorization": basic(USERNAME, PASSWORD)}, FIRED)
        assert res.status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_empty_body(self, method):
        res = send(method, {"Authorization": basic(USERNAME, PASSWORD)})
        assert res.status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_checks_credential_first(self, method):
        assert send(method, {"Authorization": basic(USERNAME, "wrong")}).status_code == 401


class TestBody:
    def test_keeps_non_json_text(self):
        res = send("POST", {"Authorization": basic(USERNAME, PASSWORD), "content-type": "text/plain"}, "Rule High CPU fired")
        assert res.status_code == 200

    def test_handles_json_array(self):
        assert send("POST", {"Authorization": basic(USERNAME, PASSWORD)}, "[1,2]").status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
