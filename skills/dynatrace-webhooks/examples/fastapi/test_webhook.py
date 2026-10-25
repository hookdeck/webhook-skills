import json
import os

# Set test environment variables before importing the app
os.environ["DYNATRACE_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["DYNATRACE_WEBHOOK_SECRET"] = "Bearer test_dynatrace_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_dynatrace_request

client = TestClient(app)

HEADER = os.environ["DYNATRACE_WEBHOOK_HEADER"]
SECRET = os.environ["DYNATRACE_WEBHOOK_SECRET"]


def sample_payload(state="OPEN"):
    """Illustrative payload: Dynatrace sends whatever template you configure."""
    return {
        "ProblemID": "P-2401",
        "State": state,
        "ProblemTitle": "Response time degradation",
        "ImpactedEntity": "checkout-service",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/dynatrace",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_exact_whole_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_not_stripped_bearer(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_other_header_name(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest on str raises TypeError for non-ASCII; bytes digests never do.
        res = client.post(
            "/webhooks/dynatrace",
            content=json.dumps(sample_payload()),
            headers={"Content-Type": "application/json", HEADER.lower(): "café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_defaults_to_authorization_header(self, monkeypatch):
        monkeypatch.delenv("DYNATRACE_WEBHOOK_HEADER")
        assert verify_dynatrace_request({"authorization": SECRET}) is True
        assert verify_dynatrace_request({HEADER.lower(): SECRET}) is False

    def test_unconfigured_secret_rejects_everything(self):
        headers = {HEADER: SECRET}
        assert verify_dynatrace_request(headers, HEADER, "") is False
        assert verify_dynatrace_request(headers, HEADER, SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_xml_body(self):
        res = post({HEADER: SECRET}, body="<problem><id>1</id></problem>", content_type="application/xml")
        assert res.status_code == 200

    def test_text_body(self):
        res = post({HEADER: SECRET}, body="Problem P-1 OPEN", content_type="text/plain")
        assert res.status_code == 200

    def test_unauthenticated_non_json_is_401(self):
        assert post(body="{not json").status_code == 401


class TestProblemHandling:
    @pytest.mark.parametrize("state", ["OPEN"])
    def test_handles_state(self, state, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(state)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    # The docs show only OPEN; other values (e.g. the one sent on resolution) are logged.
    def test_other_state_is_acknowledged_and_logged(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("NOT_OPEN")))
        assert res.status_code == 200
        assert "state NOT_OPEN" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
