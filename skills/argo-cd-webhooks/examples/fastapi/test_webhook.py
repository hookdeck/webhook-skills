import json
import os

import pytest
from fastapi.testclient import TestClient

HEADER = "X-Argo-Secret"
SECRET = "test_argo_cd_secret_0123456789"

os.environ["ARGO_CD_WEBHOOK_HEADER"] = HEADER
os.environ["ARGO_CD_WEBHOOK_SECRET"] = SECRET

from main import app, verify_argo_cd_request  # noqa: E402

client = TestClient(app)
URL = "/webhooks/argo-cd"
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
TRIGGERS = ["on-sync-succeeded", "on-sync-failed", "on-health-degraded"]


def payload_for(trigger):
    # Illustrative payload from the template in references/setup.md.
    return {"trigger": trigger, "app": "guestbook", "sync_status": "Synced", "health": "Healthy"}


OK_BODY = json.dumps(payload_for("on-sync-succeeded"))


def send(method, headers=None, body=None, content_type="application/json"):
    headers = dict(headers or {})
    if body is not None:
        headers["Content-Type"] = content_type
    return client.request(method, URL, headers=headers, content=body)


class TestCredentialVerification:
    def test_accepts_correct_value(self):
        res = send("POST", {HEADER: SECRET}, OK_BODY)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send("POST", {"x-argo-secret": SECRET}, OK_BODY).status_code == 200

    def test_rejects_wrong_value_same_length(self):
        assert send("POST", {HEADER: "x" * len(SECRET)}, "{}").status_code == 401

    def test_rejects_value_of_different_length(self):
        assert send("POST", {HEADER: "short"}, "{}").status_code == 401

    def test_rejects_missing_header(self):
        assert send("POST", {}, OK_BODY).status_code == 401

    def test_does_not_accept_secret_in_another_header(self):
        assert send("POST", {"Authorization": SECRET}, "{}").status_code == 401

    def test_compares_whole_value_without_stripping_bearer(self):
        bearer = f"Bearer {SECRET}"
        assert verify_argo_cd_request({"authorization": bearer}, bearer, "Authorization") is True
        assert verify_argo_cd_request({"authorization": bearer}, SECRET, "Authorization") is False
        assert verify_argo_cd_request({"authorization": SECRET}, bearer, "Authorization") is False

    def test_rejects_everything_when_no_secret_configured(self):
        h = {"x-argo-secret": SECRET}
        assert verify_argo_cd_request(h, "", HEADER) is False
        assert verify_argo_cd_request(h, SECRET, HEADER) is True

    def test_non_ascii_secret_does_not_raise(self):
        assert verify_argo_cd_request({"x-argo-secret": "sécret"}, "sécret", HEADER) is True
        assert verify_argo_cd_request({"x-argo-secret": "sécret"}, "secret", HEADER) is False


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_credential(self, method):
        body = None if method == "GET" else OK_BODY
        assert send(method, {HEADER: SECRET}, body).status_code == 200

    @pytest.mark.parametrize("method", METHODS)
    def test_checks_credential_first(self, method):
        assert send(method, {}).status_code == 401

    def test_empty_get_is_success(self):
        res = send("GET", {HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_reads_templated_body_on_get(self, capsys):
        # Argo CD sends the template body with every method, GET included.
        res = send("GET", {HEADER: SECRET}, json.dumps(payload_for("on-sync-failed")))
        assert res.status_code == 200
        assert "Sync failed: guestbook" in capsys.readouterr().out

    def test_empty_post_body(self):
        assert send("POST", {HEADER: SECRET}).status_code == 200


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        res = send("POST", {HEADER: SECRET}, OK_BODY, content_type="text/plain")
        assert res.status_code == 200

    def test_400_for_invalid_json_after_authenticating(self):
        assert send("POST", {HEADER: SECRET}, "{not json").status_code == 400

    def test_400_for_non_object_json(self):
        assert send("POST", {HEADER: SECRET}, "[1,2]").status_code == 400

    def test_401_not_400_for_invalid_json_without_credential(self):
        assert send("POST", {}, "{not json").status_code == 401


class TestNotificationHandling:
    @pytest.mark.parametrize("trigger", TRIGGERS)
    def test_handles_trigger(self, trigger, capsys):
        res = send("POST", {HEADER: SECRET}, json.dumps(payload_for(trigger)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_trigger(self):
        res = send("POST", {HEADER: SECRET}, json.dumps(payload_for("on-something-new")))
        assert res.status_code == 200
