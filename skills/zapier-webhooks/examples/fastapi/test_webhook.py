# Generated with: zapier-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64

import pytest
from fastapi.testclient import TestClient

from main import app, parse_body, verify_basic_auth, verify_zapier_request

# Webhooks by Zapier sends no signature, so there is nothing to sign here.
# Tests send the same credentials a Zap would: the X-Webhook-Secret header
# added in the Headers section, or Basic Auth from the "user|password" field.
SECRET = "a3f1c9e07b2d4e6f8a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f"
USERNAME = "zapier"
PASSWORD = "pa55:w0rd"  # ':' is allowed; '|' is not (Zapier's Basic Auth field splits on it)
PATH = "/webhooks/zapier"

client = TestClient(app)


def basic(username: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("ZAPIER_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("ZAPIER_BASIC_AUTH_USERNAME", raising=False)
    monkeypatch.delenv("ZAPIER_BASIC_AUTH_PASSWORD", raising=False)
    return monkeypatch


@pytest.fixture
def basic_only(env):
    env.delenv("ZAPIER_WEBHOOK_SECRET")
    env.setenv("ZAPIER_BASIC_AUTH_USERNAME", USERNAME)
    env.setenv("ZAPIER_BASIC_AUTH_PASSWORD", PASSWORD)


class TestSecretHeader:
    def test_accepts_json_with_correct_secret(self):
        res = client.post(
            PATH,
            json={"first_name": "Bryan", "last_name": "Helmig", "age": 27},
            headers={"X-Webhook-Secret": SECRET},
        )
        assert res.status_code == 200
        assert res.json() == {"received": True, "event": "zap action"}

    def test_accepts_form_payload(self):
        res = client.post(
            PATH,
            content="first_name=Bryan&last_name=Helmig&age=27",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Webhook-Secret": SECRET,
            },
        )
        assert res.status_code == 200

    def test_accepts_raw_xml_with_put(self):
        res = client.put(
            PATH,
            content="<first_name>Bryan</first_name>",
            headers={"Content-Type": "application/xml", "X-Webhook-Secret": SECRET},
        )
        assert res.status_code == 200

    def test_accepts_custom_request_with_patch(self):
        res = client.patch(PATH, json={"id": 42}, headers={"X-Webhook-Secret": SECRET})
        assert res.status_code == 200

    def test_dispatches_on_user_defined_event_field(self):
        res = client.post(PATH, json={"event": "lead.created"}, headers={"X-Webhook-Secret": SECRET})
        assert res.json()["event"] == "lead.created"

    def test_rejects_wrong_secret(self):
        res = client.post(PATH, json={}, headers={"X-Webhook-Secret": SECRET[:-1] + "0"})
        assert res.status_code == 401

    def test_rejects_missing_secret(self):
        assert client.post(PATH, json={}).status_code == 401

    def test_rejects_different_length_secret(self):
        res = client.post(PATH, json={}, headers={"X-Webhook-Secret": "short"})
        assert res.status_code == 401

    def test_authenticates_before_parsing(self):
        res = client.post(PATH, content="{not json", headers={"Content-Type": "application/json"})
        assert res.status_code == 401

    def test_malformed_json_with_valid_secret_is_400(self):
        res = client.post(
            PATH,
            content="{not json",
            headers={"Content-Type": "application/json", "X-Webhook-Secret": SECRET},
        )
        assert res.status_code == 400


class TestBasicAuth:
    def test_accepts_correct_credentials(self, basic_only):
        res = client.post(PATH, json={}, headers={"Authorization": basic(USERNAME, PASSWORD)})
        assert res.status_code == 200

    def test_rejects_wrong_password(self, basic_only):
        res = client.post(PATH, json={}, headers={"Authorization": basic(USERNAME, "nope")})
        assert res.status_code == 401

    def test_rejects_invalid_base64(self, basic_only):
        res = client.post(PATH, json={}, headers={"Authorization": "Basic !!!"})
        assert res.status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert verify_basic_auth(f"Bearer {PASSWORD}", USERNAME, PASSWORD) is False

    def test_accepts_either_method_when_both_configured(self, env):
        env.setenv("ZAPIER_BASIC_AUTH_USERNAME", USERNAME)
        env.setenv("ZAPIER_BASIC_AUTH_PASSWORD", PASSWORD)
        via_header = client.post(PATH, json={}, headers={"X-Webhook-Secret": SECRET})
        via_basic = client.post(PATH, json={}, headers={"Authorization": basic(USERNAME, PASSWORD)})
        assert via_header.status_code == 200
        assert via_basic.status_code == 200


class TestFailClosed:
    def test_returns_500_when_nothing_configured(self, env):
        env.delenv("ZAPIER_WEBHOOK_SECRET")
        res = client.post(PATH, json={}, headers={"X-Webhook-Secret": ""})
        assert res.status_code == 500
        assert verify_zapier_request({}) is None

    def test_ignores_half_configured_basic_auth(self, env):
        env.delenv("ZAPIER_WEBHOOK_SECRET")
        env.setenv("ZAPIER_BASIC_AUTH_USERNAME", USERNAME)
        assert verify_zapier_request({"authorization": basic(USERNAME, "")}) is None


def test_parse_body_form():
    assert parse_body(b"a=1&b=two", "application/x-www-form-urlencoded") == {"a": "1", "b": "two"}


def test_parse_body_other_types_returned_as_text():
    assert parse_body(b"raw", "text/plain") == "raw"


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
