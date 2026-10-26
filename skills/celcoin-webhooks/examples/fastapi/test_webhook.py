# Generated with: celcoin-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Celcoin webhook receiver.

Credentials are built exactly as Celcoin builds them: Basic base64(login:pwd).
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_celcoin_auth

USERNAME = "celcoin-hook"
PASSWORD = "p@ss:word-with-colon"
URL = "/webhooks/celcoin"

PIX_IN = {
    "entity": "pix-payment-in",
    "createTimestamp": "2025-05-07T17:30:00.7647117",
    "status": "CONFIRMED",
    "body": {"id": "e2726e30-c318-4e1f-b284-e37c14e6c4b2", "amount": 10.5},
}
JSON_HEADERS = {"content-type": "application/json"}

client = TestClient(app)


def basic(username: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")


GOOD = basic(USERNAME, PASSWORD)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CELCOIN_WEBHOOK_USERNAME", USERNAME)
    monkeypatch.setenv("CELCOIN_WEBHOOK_PASSWORD", PASSWORD)
    return monkeypatch


class TestVerifyCelcoinAuth:
    def test_accepts_matching_credentials(self):
        assert verify_celcoin_auth(GOOD, USERNAME, PASSWORD)

    def test_accepts_lowercase_scheme_and_colons_in_password(self):
        assert verify_celcoin_auth(GOOD.replace("Basic", "basic"), USERNAME, PASSWORD)

    def test_rejects_wrong_credentials_and_other_schemes(self):
        assert not verify_celcoin_auth(basic(USERNAME, "nope"), USERNAME, PASSWORD)
        assert not verify_celcoin_auth(basic("nope", PASSWORD), USERNAME, PASSWORD)
        assert not verify_celcoin_auth(None, USERNAME, PASSWORD)
        assert not verify_celcoin_auth("Bearer abc", USERNAME, PASSWORD)

    def test_rejects_valid_credentials_followed_by_junk(self):
        assert not verify_celcoin_auth(GOOD + "!!", USERNAME, PASSWORD)
        assert not verify_celcoin_auth(GOOD + " extra", USERNAME, PASSWORD)
        assert not verify_celcoin_auth(GOOD + "A", USERNAME, PASSWORD)

    def test_rejects_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"nocolon").decode()
        assert not verify_celcoin_auth(header, USERNAME, PASSWORD)

    def test_non_ascii_credentials_do_not_raise(self):
        assert verify_celcoin_auth(basic("usuário", "senha-ção"), "usuário", "senha-ção")
        assert not verify_celcoin_auth(basic("usuário", "senha-ção"), USERNAME, PASSWORD)

    def test_fails_closed_when_unconfigured(self):
        assert not verify_celcoin_auth(GOOD, "", "")
        assert not verify_celcoin_auth(GOOD, None, None)


class TestPost:
    def test_accepts_authenticated_notification(self):
        res = client.post(URL, content=json.dumps(PIX_IN), headers={**JSON_HEADERS, "authorization": GOOD})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_any_content_type(self):
        headers = {"content-type": "application/vnd.api+json", "authorization": GOOD}
        assert client.post(URL, content=json.dumps(PIX_IN), headers=headers).status_code == 200

    @pytest.mark.parametrize(
        "entity",
        [
            "pix-payment-out",
            "pix-reversal-in",
            "internal-transfer-in",
            "spb-transfer-out",
            "onboarding-proposal",
            "kyc",
            "unknown-entity",
        ],
    )
    @pytest.mark.parametrize("status", ["CONFIRMED", "ERROR"])
    def test_handles_entities(self, entity, status):
        body = json.dumps({"entity": entity, "status": status, "createTimestamp": "2025-05-07T17:30:00", "body": {}})
        res = client.post(URL, content=body, headers={**JSON_HEADERS, "authorization": GOOD})
        assert res.status_code == 200

    def test_rejects_missing_header_with_401(self):
        assert client.post(URL, content=json.dumps(PIX_IN), headers=JSON_HEADERS).status_code == 401

    def test_rejects_wrong_credentials_with_401(self):
        headers = {**JSON_HEADERS, "authorization": basic(USERNAME, "wrong")}
        assert client.post(URL, content=json.dumps(PIX_IN), headers=headers).status_code == 401

    def test_rejects_malformed_json_with_400_after_auth(self):
        res = client.post(URL, content="{not json", headers={**JSON_HEADERS, "authorization": GOOD})
        assert res.status_code == 400

    def test_rejects_non_object_json_with_400(self):
        res = client.post(URL, content="[1,2]", headers={**JSON_HEADERS, "authorization": GOOD})
        assert res.status_code == 400

    def test_acknowledges_empty_body(self):
        assert client.post(URL, headers={"authorization": GOOD}).status_code == 200

    def test_returns_500_when_unconfigured(self, env):
        env.delenv("CELCOIN_WEBHOOK_USERNAME")
        env.delenv("CELCOIN_WEBHOOK_PASSWORD")
        assert client.post(URL, headers={"authorization": GOOD}).status_code == 500


class TestOtherMethods:
    @pytest.mark.parametrize("method", ["GET", "PUT", "PATCH", "DELETE"])
    def test_accepts_authenticated_empty_body(self, method):
        assert client.request(method, URL, headers={"authorization": GOOD}).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
    def test_checks_credential_first(self, method):
        assert client.request(method, URL).status_code == 401

    def test_accepts_json_body_on_put(self):
        res = client.put(URL, content=json.dumps(PIX_IN), headers={**JSON_HEADERS, "authorization": GOOD})
        assert res.status_code == 200
