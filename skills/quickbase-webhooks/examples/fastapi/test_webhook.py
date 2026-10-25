import json
import os

# Set test environment variables before importing the app
os.environ["QUICKBASE_WEBHOOK_SECRET"] = "Bearer test_quickbase_secret_0123456789"
os.environ.pop("QUICKBASE_WEBHOOK_HEADER", None)

import pytest
from fastapi.testclient import TestClient

from main import app, verify_quickbase_request

client = TestClient(app)

SECRET = os.environ["QUICKBASE_WEBHOOK_SECRET"]

# Illustrative payloads: Quickbase adds no event field; these are user-written templates.
EVENTS = ["record_added", "record_modified", "record_deleted"]


def sample(event="record_added"):
    return {"event": event, "record_id": 42, "table": "Projects"}


def send(method="POST", headers=None, body=None, content_type="application/json", empty=False):
    h = dict(headers or {})
    kwargs = {"headers": h}
    if not empty:
        h["Content-Type"] = content_type
        kwargs["content"] = body if body is not None else json.dumps(sample())
    return client.request(method, "/webhooks/quickbase", **kwargs)


AUTH = {"Authorization": SECRET}


class TestSecretHeaderVerification:
    def test_accepts_correct_whole_value(self):
        res = send(headers=AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={"authorization": SECRET}).status_code == 200

    def test_rejects_wrong_value_same_length(self):
        assert send(headers={"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert send(headers={"Authorization": "short"}).status_code == 401

    def test_rejects_value_with_bearer_stripped(self):
        assert send(headers={"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_rejects_before_parsing(self):
        res = send(headers={"Authorization": "nope"}, body="{not json")
        assert res.status_code == 401

    def test_reads_header_name_from_env(self, monkeypatch):
        monkeypatch.setenv("QUICKBASE_WEBHOOK_HEADER", "X-Qb-Secret")
        assert send(headers={"X-Qb-Secret": SECRET}).status_code == 200
        assert send(headers={"Authorization": SECRET}).status_code == 401

    def test_rejects_everything_when_secret_unset(self):
        assert verify_quickbase_request({"Authorization": "anything"}, secret="") is False

    def test_non_ascii_values_do_not_raise(self):
        # compare_digest on str would raise TypeError for non-ASCII; bytes never do.
        headers = {"Authorization": "pässwörd".encode("utf-8").decode("latin-1")}
        assert verify_quickbase_request(headers, secret="pässwörd") is True
        assert verify_quickbase_request(headers, secret="password") is False
        assert verify_quickbase_request({"Authorization": "pässwörd"}, secret="pässword") is False


class TestHttpMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_accepts_methods_with_body(self, method):
        assert send(method, headers=AUTH).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_accepts_methods_with_empty_body(self, method):
        res = send(method, headers=AUTH, empty=True)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_rejects_unauthenticated(self, method):
        assert send(method, empty=True).status_code == 401

    def test_unsupported_method_is_405(self):
        res = client.request("OPTIONS", "/webhooks/quickbase", headers=AUTH)
        assert res.status_code == 405


class TestBodies:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_illustrative_events(self, event):
        assert send(headers=AUTH, body=json.dumps(sample(event))).status_code == 200

    def test_acknowledges_unrecognized_events(self):
        assert send(headers=AUTH, body=json.dumps({"event": "other"})).status_code == 200

    def test_accepts_xml_body(self):
        res = send(headers=AUTH, body="<record><id>42</id></record>", content_type="application/xml")
        assert res.status_code == 200

    def test_accepts_raw_text_body(self):
        res = send(headers=AUTH, body="record 42 changed", content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_malformed_json_once_authenticated(self):
        assert send(headers=AUTH, body="{not json").status_code == 200

    def test_accepts_json_array_as_opaque(self):
        assert send(headers=AUTH, body="[1,2]").status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
