# Generated with: azure-logic-apps-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Azure Logic Apps HTTP action receiver.

Credentials are built exactly as Logic Apps builds them: Basic authentication sends
base64("username:password"); Raw authentication sends the configured Value verbatim.
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_basic_auth, verify_shared_secret

USERNAME = "logicapps"
PASSWORD = "p@ss:word-with-colon"
SHARED_SECRET = "la_shared_secret_0123456789abcdef"
URL = "/webhooks/azure-logic-apps"

PAYLOAD = {
    "orderId": "ORD-1001",
    "status": "approved",
    "runId": "08584123456789012345678901234CU00",
}
BODY = json.dumps(PAYLOAD)
JSON_HEADERS = {"content-type": "application/json"}

ENV_KEYS = [
    "AZURE_LOGIC_APPS_USERNAME",
    "AZURE_LOGIC_APPS_PASSWORD",
    "AZURE_LOGIC_APPS_SHARED_SECRET",
    "AZURE_LOGIC_APPS_SECRET_HEADER",
]

client = TestClient(app)


def basic_header(username: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")


@pytest.fixture
def env(monkeypatch):
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)

    def _set(**values: str) -> None:
        for key, value in values.items():
            monkeypatch.setenv(key, value)

    return _set


class TestVerifyBasicAuth:
    def test_accepts_matching_credentials(self):
        assert verify_basic_auth(basic_header(USERNAME, PASSWORD), USERNAME, PASSWORD)

    def test_password_may_contain_colons(self):
        assert verify_basic_auth(basic_header("u", "a:b:c"), "u", "a:b:c")

    def test_lowercase_scheme(self):
        header = basic_header(USERNAME, PASSWORD).replace("Basic", "basic")
        assert verify_basic_auth(header, USERNAME, PASSWORD)

    def test_rejects_wrong_credentials(self):
        assert not verify_basic_auth(basic_header(USERNAME, "nope"), USERNAME, PASSWORD)
        assert not verify_basic_auth(basic_header("admin", PASSWORD), USERNAME, PASSWORD)

    def test_rejects_other_schemes_and_garbage(self):
        assert not verify_basic_auth(f"Bearer {PASSWORD}", USERNAME, PASSWORD)
        assert not verify_basic_auth("Basic", USERNAME, PASSWORD)
        assert not verify_basic_auth("Basic bm9jb2xvbg==", USERNAME, PASSWORD)  # "nocolon"
        assert not verify_basic_auth("Basic !!!notbase64", USERNAME, PASSWORD)
        assert not verify_basic_auth(None, USERNAME, PASSWORD)


class TestVerifySharedSecret:
    def test_exact_secret(self):
        assert verify_shared_secret(SHARED_SECRET, SHARED_SECRET)

    def test_rejects_others_without_raising(self):
        assert not verify_shared_secret("short", SHARED_SECRET)
        assert not verify_shared_secret(SHARED_SECRET + "x", SHARED_SECRET)
        assert not verify_shared_secret(None, SHARED_SECRET)
        assert not verify_shared_secret("café", SHARED_SECRET)  # non-ASCII is fine


class TestBasicAuthEndpoint:
    @pytest.fixture(autouse=True)
    def _basic(self, env):
        env(AZURE_LOGIC_APPS_USERNAME=USERNAME, AZURE_LOGIC_APPS_PASSWORD=PASSWORD)

    def test_valid_credentials(self):
        res = client.post(
            URL,
            content=BODY,
            headers={**JSON_HEADERS, "authorization": basic_header(USERNAME, PASSWORD)},
        )
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_missing_header(self):
        res = client.post(URL, content=BODY, headers=JSON_HEADERS)
        assert res.status_code == 401
        assert res.headers["www-authenticate"].startswith("Basic")

    def test_wrong_password(self):
        res = client.post(
            URL,
            content=BODY,
            headers={**JSON_HEADERS, "authorization": basic_header(USERNAME, "wrong")},
        )
        assert res.status_code == 401

    def test_malformed_json_after_auth(self):
        res = client.post(
            URL,
            content='{"orderId":',
            headers={**JSON_HEADERS, "authorization": basic_header(USERNAME, PASSWORD)},
        )
        assert res.status_code == 400

    def test_non_json_body(self):
        res = client.post(
            URL,
            content="plain text from a Compose action",
            headers={
                "content-type": "text/plain",
                "authorization": basic_header(USERNAME, PASSWORD),
            },
        )
        assert res.status_code == 200


class TestSharedSecretEndpoint:
    def test_default_header(self, env):
        env(AZURE_LOGIC_APPS_SHARED_SECRET=SHARED_SECRET)
        res = client.post(
            URL, content=BODY, headers={**JSON_HEADERS, "x-logic-apps-secret": SHARED_SECRET}
        )
        assert res.status_code == 200

    def test_wrong_secret(self, env):
        env(AZURE_LOGIC_APPS_SHARED_SECRET=SHARED_SECRET)
        res = client.post(
            URL, content=BODY, headers={**JSON_HEADERS, "x-logic-apps-secret": "wrong"}
        )
        assert res.status_code == 401

    def test_raw_authentication(self, env):
        # Raw auth "Value" is sent verbatim as the Authorization header.
        raw_value = f"Bearer {SHARED_SECRET}"
        env(
            AZURE_LOGIC_APPS_SHARED_SECRET=raw_value,
            AZURE_LOGIC_APPS_SECRET_HEADER="Authorization",
        )
        ok = client.post(URL, content=BODY, headers={**JSON_HEADERS, "authorization": raw_value})
        assert ok.status_code == 200
        bad = client.post(
            URL, content=BODY, headers={**JSON_HEADERS, "authorization": SHARED_SECRET}
        )
        assert bad.status_code == 401


def test_both_methods_must_pass(env):
    env(
        AZURE_LOGIC_APPS_USERNAME=USERNAME,
        AZURE_LOGIC_APPS_PASSWORD=PASSWORD,
        AZURE_LOGIC_APPS_SHARED_SECRET=SHARED_SECRET,
    )
    basic = {**JSON_HEADERS, "authorization": basic_header(USERNAME, PASSWORD)}
    assert client.post(URL, content=BODY, headers=basic).status_code == 401
    both = {**basic, "x-logic-apps-secret": SHARED_SECRET}
    assert client.post(URL, content=BODY, headers=both).status_code == 200


def test_fails_closed_without_config(env):
    res = client.post(
        URL,
        content=BODY,
        headers={**JSON_HEADERS, "authorization": basic_header(USERNAME, PASSWORD)},
    )
    assert res.status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
