import base64
import json
import os

# Set test environment variables before importing the app
os.environ["NEW_RELIC_WEBHOOK_USERNAME"] = "newrelic"
os.environ["NEW_RELIC_WEBHOOK_PASSWORD"] = "p@ss:word, with: colons"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_new_relic_request

client = TestClient(app)

USER = os.environ["NEW_RELIC_WEBHOOK_USERNAME"]
PASS = os.environ["NEW_RELIC_WEBHOOK_PASSWORD"]

STATES = ["CREATED", "ACTIVATED", "CLOSED"]


def basic(user, password, scheme="Basic"):
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()
    return f"{scheme} {token}"


def sample_payload(state="ACTIVATED", acknowledged=False):
    # Illustrative payload from the Handlebars template in references/setup.md
    return {
        "issueId": "a1b2c3d4-0000-4000-8000-000000000001",
        "title": "High CPU on web-1",
        "state": state,
        "acknowledged": acknowledged,
        "priority": "CRITICAL",
        "issuePageUrl": "https://one.newrelic.com/alerts-ai/issues/a1b2c3d4",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/new-relic",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBasicAuthentication:
    def test_correct_credentials(self):
        res = post({"Authorization": basic(USER, PASS)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post({"Authorization": basic(USER, PASS, "basic")}).status_code == 200

    def test_password_containing_colons(self):
        assert verify_new_relic_request({"authorization": basic(USER, PASS)}) is True

    def test_non_ascii_credentials_do_not_raise(self):
        headers = {"authorization": basic("üser", "pässwörd:✓")}
        assert verify_new_relic_request(headers, "üser", "pässwörd:✓") is True
        assert verify_new_relic_request(headers, "user", "password") is False

    def test_wrong_password(self):
        assert post({"Authorization": basic(USER, "x" * len(PASS))}).status_code == 401

    def test_wrong_username(self):
        assert post({"Authorization": basic("nobody", PASS)}).status_code == 401

    def test_wrong_password_different_length(self):
        assert post({"Authorization": basic(USER, "short")}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_bearer_scheme_is_not_accepted(self):
        assert post({"Authorization": f"Bearer {PASS}"}).status_code == 401

    def test_no_colon(self):
        token = base64.b64encode(b"nocolon").decode()
        assert post({"Authorization": f"Basic {token}"}).status_code == 401

    def test_malformed_header(self):
        assert post({"Authorization": "Basic"}).status_code == 401
        assert post({"Authorization": "Basic !!!"}).status_code == 401

    def test_unconfigured_credentials_reject_everything(self):
        headers = {"authorization": basic(USER, PASS)}
        assert verify_new_relic_request(headers, username="", password=PASS) is False
        assert verify_new_relic_request(headers, username=USER, password="") is False
        assert verify_new_relic_request(headers, username=USER, password=PASS) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Authorization": basic(USER, PASS)}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"Authorization": basic(USER, PASS)}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Authorization": basic(USER, PASS)}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credentials_is_401(self):
        assert post(body="{not json").status_code == 401


class TestIssueStateHandling:
    @pytest.mark.parametrize("state", STATES)
    def test_handles_state(self, state, capsys):
        res = post({"Authorization": basic(USER, PASS)}, body=json.dumps(sample_payload(state)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledged_issue_uses_boolean(self, capsys):
        res = post({"Authorization": basic(USER, PASS)}, body=json.dumps(sample_payload("ACTIVATED", True)))
        assert res.status_code == 200
        assert "Issue acknowledged" in capsys.readouterr().out

    def test_unknown_state_is_acknowledged(self):
        res = post({"Authorization": basic(USER, PASS)}, body=json.dumps(sample_payload("SOMETHING_NEW")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
