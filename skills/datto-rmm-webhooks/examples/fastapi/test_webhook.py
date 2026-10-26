import json
import os

# Set test environment variables before importing the app
os.environ["DATTO_RMM_WEBHOOK_HEADER"] = "X-Datto-Secret"
os.environ["DATTO_RMM_WEBHOOK_SECRET"] = "Bearer test_datto_rmm_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_datto_rmm_request

client = TestClient(app)

HEADER = os.environ["DATTO_RMM_WEBHOOK_HEADER"]
SECRET = os.environ["DATTO_RMM_WEBHOOK_SECRET"]


def sample_payload(status="raised"):
    # ILLUSTRATIVE payload: Datto RMM adds no event field; "status" comes from the user's template.
    return {
        "status": status,
        "alert_uid": "a1b2c3d4",
        "alert_type": "disk usage",
        "alert_category": "performance",
        "alert_message": "C: drive is at 95% capacity",
        "device_hostname": "SRV-01",
        "site_name": "Acme",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/datto-rmm",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_accepts_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_compares_whole_value_including_bearer(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_secret_under_different_header(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_is_rejected_not_an_error(self):
        # compare_digest on str would raise TypeError; bytes comparison must not.
        res = client.post(
            "/webhooks/datto-rmm",
            content=json.dumps(sample_payload()),
            headers={"Content-Type": "application/json", HEADER: "café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_defaults_to_authorization_header(self, monkeypatch):
        monkeypatch.delenv("DATTO_RMM_WEBHOOK_HEADER")
        assert verify_datto_rmm_request(Headers({"authorization": SECRET})) is True
        assert verify_datto_rmm_request(Headers({HEADER: SECRET})) is False

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        assert verify_datto_rmm_request(Headers({HEADER: SECRET}), secret="") is False
        monkeypatch.delenv("DATTO_RMM_WEBHOOK_SECRET")
        assert verify_datto_rmm_request(Headers({HEADER: SECRET})) is False


class TestBodyHandling:
    def test_accepts_text_plain(self):
        assert post({HEADER: SECRET}, "Alert raised on SRV-01", "text/plain").status_code == 200

    def test_accepts_form_urlencoded(self):
        res = post(
            {HEADER: SECRET},
            "status=resolved&alert_uid=a1b2c3d4",
            "application/x-www-form-urlencoded",
        )
        assert res.status_code == 200

    def test_accepts_invalid_json_as_text_after_auth(self):
        assert post({HEADER: SECRET}, "{not json").status_code == 200

    def test_returns_401_before_looking_at_body(self):
        assert post(None, "{not json").status_code == 401


class TestAlertHandling:
    @pytest.mark.parametrize("status", ["raised", "resolved"])
    def test_handles_status(self, status, capsys):
        res = post({HEADER: SECRET}, json.dumps(sample_payload(status)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unrecognised_payload(self, capsys):
        res = post({HEADER: SECRET}, json.dumps({"hello": "world"}))
        assert res.status_code == 200
        assert "Unhandled" in capsys.readouterr().out


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
