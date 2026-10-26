import base64
import json
import os

# Set test environment variables before importing the app
os.environ["ALERTMANAGER_WEBHOOK_SECRET"] = "test_alertmanager_secret_0123456789"
os.environ["ALERTMANAGER_WEBHOOK_USERNAME"] = "alertmanager"
os.environ["ALERTMANAGER_WEBHOOK_PASSWORD"] = "pa:ss_word_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, seen, verify_alertmanager_request

client = TestClient(app)

SECRET = os.environ["ALERTMANAGER_WEBHOOK_SECRET"]
AUTH = {"Authorization": f"Bearer {SECRET}"}
USER = os.environ["ALERTMANAGER_WEBHOOK_USERNAME"]
PASS = os.environ["ALERTMANAGER_WEBHOOK_PASSWORD"]


def basic_auth(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


@pytest.fixture(autouse=True)
def clear_seen():
    seen.clear()


def alert(status="firing", fingerprint="1a2b3c4d5e6f7a8b"):
    return {
        "status": status,
        "labels": {"alertname": "HighCPU", "instance": "web-1:9100", "severity": "critical"},
        "annotations": {"summary": "CPU above 90%"},
        "startsAt": "2026-10-26T10:00:00.000Z",
        "endsAt": "2026-10-26T10:30:00.000Z" if status == "resolved" else "0001-01-01T00:00:00Z",
        "generatorURL": "http://prometheus:9090/graph?g0.expr=cpu",
        "fingerprint": fingerprint,
    }


def group(status="firing", alerts=None):
    return {
        "version": "4",
        "groupKey": '{}:{alertname="HighCPU"}',
        "truncatedAlerts": 0,
        "status": status,
        "receiver": "hookdeck",
        "groupLabels": {"alertname": "HighCPU"},
        "commonLabels": {"alertname": "HighCPU", "severity": "critical"},
        "commonAnnotations": {"summary": "CPU above 90%"},
        "externalURL": "http://alertmanager:9093",
        "alerts": [alert(status)] if alerts is None else alerts,
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(group())
    return client.post(
        "/webhooks/prometheus-alertmanager",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBearerVerification:
    def test_correct_credentials(self):
        res = post(AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post({"Authorization": f"bearer {SECRET}"}).status_code == 200
        assert post({"Authorization": f"BEARER {SECRET}"}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({"Authorization": "Bearer " + "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({"Authorization": "Bearer short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_bare_secret_without_scheme(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_wrong_scheme(self):
        basic = base64.b64encode(f"user:{SECRET}".encode()).decode()
        assert post({"Authorization": f"Basic {basic}"}).status_code == 401
        assert post({"Authorization": f"Token {SECRET}"}).status_code == 401

    def test_credentials_are_not_trimmed(self):
        assert verify_alertmanager_request({"authorization": f"Bearer {SECRET} "}, SECRET) is False

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_alertmanager_request({"authorization": "Bearer pässword"}, "pässword") is True
        assert verify_alertmanager_request({"authorization": "Bearer pässwörd"}, "pässword") is False

    def test_fails_closed_when_unconfigured(self):
        assert verify_alertmanager_request({"authorization": "Bearer anything"}, "") is False

    def test_strips_leading_bearer_from_configured_secret(self):
        assert verify_alertmanager_request({"authorization": "Bearer abc"}, "Bearer abc") is True
        assert verify_alertmanager_request({"authorization": "Bearer abc"}, "bearer abc") is True

    def test_authenticates_before_parsing_body(self):
        assert post({"Authorization": "Bearer wrong"}, body="not json").status_code == 401


class TestBasicAuthVerification:
    def test_correct_credentials_password_with_colon(self):
        assert post({"Authorization": basic_auth(USER, PASS)}).status_code == 200

    def test_scheme_is_case_insensitive(self):
        token = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
        assert post({"Authorization": f"basic {token}"}).status_code == 200
        assert post({"Authorization": f"BASIC {token}"}).status_code == 200

    def test_wrong_password_or_username(self):
        assert post({"Authorization": basic_auth(USER, "wrong")}).status_code == 401
        assert post({"Authorization": basic_auth("someone", PASS)}).status_code == 401

    def test_malformed_credentials(self):
        no_colon = base64.b64encode(f"{USER}{PASS}".encode()).decode()
        valid = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
        for value in (f"Basic {no_colon}", "Basic !!not-base64!!", f"Basic {valid}AAAA", f"Basic {valid}="):
            assert post({"Authorization": value}).status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        assert verify_alertmanager_request({"authorization": "Basic pässwörd"}) is False

    def test_rejected_when_basic_not_configured(self):
        header = {"authorization": basic_auth(USER, PASS)}
        assert verify_alertmanager_request(header, SECRET, "", "") is False
        assert verify_alertmanager_request(header, SECRET, USER, "") is False

    def test_rejects_everything_when_neither_is_configured(self):
        assert verify_alertmanager_request({"authorization": basic_auth(USER, PASS)}, "", "", "") is False
        assert verify_alertmanager_request({"authorization": "Bearer x"}, "", "", "") is False

    def test_basic_without_bearer_secret(self):
        header = {"authorization": basic_auth(USER, PASS)}
        assert verify_alertmanager_request(header, "", USER, PASS) is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post(AUTH, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post(AUTH, body="not json").status_code == 400

    def test_non_object_body(self):
        assert post(AUTH, body="[1,2]").status_code == 400

    def test_non_array_alerts(self):
        body = json.dumps({**group(), "alerts": "nope"})
        assert post(AUTH, body=body).status_code == 400


class TestAlertHandling:
    def test_firing(self, capsys):
        assert post(AUTH).status_code == 200
        assert "Alert firing: HighCPU" in capsys.readouterr().out

    def test_resolved(self, capsys):
        assert post(AUTH, body=json.dumps(group("resolved"))).status_code == 200
        assert "Alert resolved: HighCPU" in capsys.readouterr().out

    def test_loops_over_alerts_using_each_status(self, capsys):
        body = json.dumps(group("firing", [alert("firing", "aaaa"), alert("resolved", "bbbb")]))
        post(AUTH, body=body)
        out = capsys.readouterr().out
        assert "Alert firing: HighCPU (aaaa)" in out
        assert "Alert resolved: HighCPU (bbbb)" in out

    def test_deduplicates_repeat_notifications(self, capsys):
        post(AUTH)
        post(AUTH)
        assert capsys.readouterr().out.count("Alert firing") == 1

    def test_resolved_is_new_after_firing(self, capsys):
        post(AUTH)
        post(AUTH, body=json.dumps(group("resolved")))
        assert "Alert resolved" in capsys.readouterr().out

    def test_empty_alerts(self):
        assert post(AUTH, body=json.dumps(group("firing", []))).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
