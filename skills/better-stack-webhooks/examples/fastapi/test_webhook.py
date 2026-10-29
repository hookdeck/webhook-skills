import base64
import json
import os

# Set test environment variables before importing the app
os.environ["BETTER_STACK_WEBHOOK_HEADER"] = "X-Better-Stack-Secret"
os.environ["BETTER_STACK_WEBHOOK_SECRET"] = "test_better_stack_secret_0123456789"
os.environ["BETTER_STACK_WEBHOOK_USERNAME"] = "betterstack"
os.environ["BETTER_STACK_WEBHOOK_PASSWORD"] = "pa:ss_word_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, classify_better_stack_payload, verify_better_stack_request

client = TestClient(app)

PATH = "/webhooks/better-stack"
SECRET = os.environ["BETTER_STACK_WEBHOOK_SECRET"]
USER = os.environ["BETTER_STACK_WEBHOOK_USERNAME"]
PASS = os.environ["BETTER_STACK_WEBHOOK_PASSWORD"]
HEADER_AUTH = {"X-Better-Stack-Secret": SECRET}


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


BASIC_AUTH = {"Authorization": basic(USER, PASS)}

# The API page's "Example incident_change payload when event is comment", verbatim.
COMMENT = {
    "event": "comment",
    "data": {
        "id": "1",
        "type": "incident",
        "attributes": {
            "name": "Tesla.com homepage",
            "url": "https://tesla.com",
            "http_method": "get",
            "cause": "Error 500",
            "started_at": "2020-10-21T10:51:28.151Z",
            "acknowledged_at": "2020-02-25T17:38:45.768Z",
            "resolved_at": None,
            "response_content": None,
            "response_url": None,
            "screenshot_url": None,
        },
        "relationships": {"monitor": {"data": {"id": "4", "type": "monitor"}}},
    },
    "comment": {
        "id": "42",
        "type": "incident_comment",
        "attributes": {
            "content": "Investigating — the database has been failing over.",
            "created_at": "2020-10-21T10:55:12.812Z",
            "updated_at": "2020-10-21T10:55:12.812Z",
            "user_id": 7,
            "user_email": "jane@example.com",
        },
    },
}


def incident(**attrs):
    """Default incident_change template rendered with plausible values."""
    attributes = {
        "name": "Tesla.com homepage",
        "url": "https://tesla.com",
        "http_method": "get",
        "cause": "Error 500",
        "started_at": "2026-10-26T10:51:28.151Z",
        "acknowledged_at": "",
        "resolved_at": "",
        "response_content": "",
        "response_url": "",
        "screenshot_url": "",
    }
    attributes.update(attrs)
    return {"data": {"id": "1", "type": "incident", "attributes": attributes}}


def monitor(paused_at=""):
    """Default monitor_change template rendered with plausible values."""
    return {
        "data": {
            "id": "4",
            "type": "monitor",
            "attributes": {
                "url": "https://tesla.com",
                "pronounceable_name": "Tesla.com homepage",
                "monitor_type": "status",
                "required_keyword": "",
                "verify_ssl": True,
                "check_frequency": 180,
                "call": False,
                "sms": False,
                "email": True,
                "team_wait": "",
                "http_method": "get",
                "request_timeout": "15",
                "recovery_period": "180",
                "request_body": "",
                "paused_at": paused_at,
                "last_checked_at": "2026-10-26T10:50:00.000Z",
            },
        }
    }


def on_call(change="on_call"):
    """Default on_call_change template rendered with plausible values."""
    return {
        "data": {
            "message": "Jane Doe is now on call",
            "emails": ["jane@example.com"],
            "on_holiday_emails": [],
            "change": change,
            "calendar_id": 12,
            "calendar_name": "Primary on-call",
            "primary_calendar": True,
        }
    }


def post(headers=None, body=None, content_type="application/json"):
    headers = dict(HEADER_AUTH if headers is None else headers)
    if body is None:
        return client.post(PATH, headers=headers)
    data = body if isinstance(body, str) else json.dumps(body)
    headers["Content-Type"] = content_type
    return client.post(PATH, headers=headers, content=data.encode())


class TestCustomHeader:
    def test_accepts_the_correct_header_value(self):
        res = post(HEADER_AUTH, incident())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_finds_the_header_case_insensitively(self):
        assert post({"x-better-stack-secret": SECRET}, incident()).status_code == 200

    @pytest.mark.parametrize(
        "value", ["wrong", SECRET + "x", SECRET[1:], f"Bearer {SECRET}"]
    )
    def test_rejects_wrong_values(self, value):
        assert post({"X-Better-Stack-Secret": value}, incident()).status_code == 401

    def test_rejects_a_missing_header(self):
        assert post({}, incident()).status_code == 401


class TestBasicAuth:
    def test_accepts_username_and_password_with_a_colon(self):
        assert ":" in PASS
        assert post(BASIC_AUTH, incident()).status_code == 200

    def test_accepts_the_scheme_in_any_case(self):
        headers = {"Authorization": basic(USER, PASS).replace("Basic", "BASIC")}
        assert post(headers, incident()).status_code == 200

    def test_rejects_wrong_username_or_password(self):
        assert post({"Authorization": basic("other", PASS)}, incident()).status_code == 401
        assert post({"Authorization": basic(USER, "wrong")}, incident()).status_code == 401

    def test_rejects_another_scheme_malformed_base64_and_no_colon(self):
        no_colon = "Basic " + base64.b64encode(b"nocolon").decode()
        for value in (
            f"Bearer {SECRET}",
            "Basic !!!notbase64",
            basic(USER, PASS) + "!!",
            no_colon,
        ):
            assert post({"Authorization": value}, incident()).status_code == 401, value


class TestVerifyFunction:
    def test_accepts_either_configured_method(self):
        env = {
            "BETTER_STACK_WEBHOOK_SECRET": "s3cret",
            "BETTER_STACK_WEBHOOK_USERNAME": "u",
            "BETTER_STACK_WEBHOOK_PASSWORD": "p",
        }
        assert verify_better_stack_request(Headers({"x-better-stack-secret": "s3cret"}), env)
        assert verify_better_stack_request(Headers({"authorization": basic("u", "p")}), env)
        assert not verify_better_stack_request(Headers({"x-better-stack-secret": "nope"}), env)

    def test_fails_closed_when_nothing_is_configured(self):
        assert not verify_better_stack_request(Headers({"x-better-stack-secret": ""}), {})
        assert not verify_better_stack_request(Headers({"authorization": basic("", "")}), {})

    def test_never_uses_a_method_that_is_not_configured(self):
        assert not verify_better_stack_request(Headers({"authorization": basic("u", "p")}), {"BETTER_STACK_WEBHOOK_SECRET": "s3cret"}
        )
        only_basic = {"BETTER_STACK_WEBHOOK_USERNAME": "u", "BETTER_STACK_WEBHOOK_PASSWORD": "p"}
        assert not verify_better_stack_request(Headers({"x-better-stack-secret": "s3cret"}), only_basic)

    def test_honours_a_custom_header_name_and_does_not_trim(self):
        env = {"BETTER_STACK_WEBHOOK_HEADER": "X-Hook-Key", "BETTER_STACK_WEBHOOK_SECRET": "s3cret"}
        assert verify_better_stack_request(Headers({"x-hook-key": "s3cret"}), env)
        assert not verify_better_stack_request(Headers({"x-better-stack-secret": "s3cret"}), env)
        assert not verify_better_stack_request(Headers({"x-hook-key": "s3cret\n"}), env)
        assert not verify_better_stack_request(Headers({"x-hook-key": " s3cret"}), env)

    def test_non_ascii_values_do_not_raise(self):
        env = {"BETTER_STACK_WEBHOOK_SECRET": "sécret"}
        assert verify_better_stack_request(Headers({"x-better-stack-secret": "sécret".encode("utf-8").decode("latin-1")}), env)
        assert not verify_better_stack_request(Headers({"x-better-stack-secret": "sécret"}), env)
        only_basic = {"BETTER_STACK_WEBHOOK_USERNAME": "üser", "BETTER_STACK_WEBHOOK_PASSWORD": "pä:ss"}
        assert verify_better_stack_request(Headers({"authorization": basic("üser", "pä:ss")}), only_basic)
        assert not verify_better_stack_request(Headers({"authorization": basic("user", "pä:ss")}), only_basic)


class TestMethods:
    METHODS = ["get", "head", "post", "put", "patch", "options"]

    @pytest.mark.parametrize("method", METHODS)
    def test_checks_the_credential_first(self, method):
        assert client.request(method.upper(), PATH).status_code == 401

    @pytest.mark.parametrize("method", METHODS)
    def test_acknowledges_an_authenticated_request_with_no_body(self, method):
        assert client.request(method.upper(), PATH, headers=HEADER_AUTH).status_code == 200

    @pytest.mark.parametrize("method", ["put", "patch"])
    def test_handles_an_authenticated_request_with_a_body(self, method, capsys):
        headers = {**BASIC_AUTH, "Content-Type": "application/json"}
        body = json.dumps(incident(resolved_at="2026-10-26T11:00:00.000Z"))
        res = client.request(method.upper(), PATH, headers=headers, content=body.encode())
        assert res.status_code == 200
        assert "resolved" in capsys.readouterr().out

    def test_other_methods_are_not_routed(self):
        assert client.delete(PATH, headers=HEADER_AUTH).status_code == 405


class TestBodyHandling:
    def test_acknowledges_a_non_json_body(self, capsys):
        res = post(HEADER_AUTH, "Incident 1 started on Tesla.com", content_type="text/plain")
        assert res.status_code == 200
        assert "non-JSON" in capsys.readouterr().out

    def test_accepts_json_under_any_content_type(self):
        res = post(HEADER_AUTH, incident(), content_type="application/x-www-form-urlencoded")
        assert res.status_code == 200

    def test_does_not_parse_the_body_before_authenticating(self):
        assert post({}, "{not json").status_code == 401

    def test_acknowledges_json_that_is_not_an_object(self):
        for body in ("[1,2]", '"text"', "42", "null"):
            assert post(HEADER_AUTH, body).status_code == 200

    def test_acknowledges_invalid_utf8(self):
        res = client.post(PATH, headers=HEADER_AUTH, content=b"\xff\xfe{")
        assert res.status_code == 200

    def test_survives_wrong_typed_fields(self):
        bodies = [
            {"data": "nope"},
            {"data": None},
            {"data": {"type": "incident", "attributes": "x", "id": {}}},
            {"event": "comment", "data": {"type": "incident"}, "comment": "x"},
            {"event": "comment", "data": {"type": "incident"}, "comment": {"attributes": []}},
            {"data": {"type": "monitor", "attributes": {"paused_at": 5, "pronounceable_name": []}}},
            {"data": {"change": "on_call", "emails": "a@b.c", "on_holiday_emails": [1, None, "x@y.z"]}},
        ]
        for body in bodies:
            assert post(HEADER_AUTH, body).status_code == 200, body


class TestEventDispatch:
    def test_handles_an_incident_comment(self, capsys):
        assert post(HEADER_AUTH, COMMENT).status_code == 200
        assert "comment by jane@example.com" in capsys.readouterr().out

    def test_handles_start_acknowledgement_and_resolution(self, capsys):
        post(HEADER_AUTH, incident())
        post(HEADER_AUTH, incident(acknowledged_at="2026-10-26T10:55:00.000Z"))
        post(
            HEADER_AUTH,
            incident(acknowledged_at="2026-10-26T10:55:00.000Z", resolved_at="2026-10-26T11:00:00.000Z"),
        )
        out = capsys.readouterr().out
        assert "started" in out and "acknowledged" in out and "resolved" in out

    def test_handles_a_paused_monitor(self, capsys):
        assert post(HEADER_AUTH, monitor("2026-10-26T10:00:00.000Z")).status_code == 200
        assert "paused" in capsys.readouterr().out

    def test_handles_an_on_call_change_and_a_holiday_change(self, capsys):
        assert post(HEADER_AUTH, on_call()).status_code == 200
        assert post(HEADER_AUTH, on_call("holiday")).status_code == 200
        assert "holiday change" in capsys.readouterr().out

    def test_logs_a_payload_it_does_not_recognise(self, capsys):
        assert post(HEADER_AUTH, {"custom": True}).status_code == 200
        assert "Unrecognised" in capsys.readouterr().out


class TestClassify:
    def test_classifies_each_documented_shape(self):
        def part(payload, **expected):
            result = classify_better_stack_payload(payload)
            assert {k: result.get(k) for k in expected} == expected

        part(COMMENT, kind="incident", state="comment", author="jane@example.com")
        part(incident(), kind="incident", state="started")
        part(incident(acknowledged_at="x"), state="acknowledged")
        part(incident(acknowledged_at="x", resolved_at="y"), state="resolved")
        part(monitor(), kind="monitor", state="changed")
        part(monitor("x"), kind="monitor", state="paused")
        part(on_call(), kind="on_call", change="on_call", emails=["jane@example.com"])
        part(on_call("holiday"), kind="on_call", change="holiday")

    @pytest.mark.parametrize(
        "value",
        [None, 1, "x", [], {}, {"data": {"type": "other"}}, {"data": {"change": "mystery"}}],
    )
    def test_returns_unknown_for_anything_else(self, value):
        assert classify_better_stack_payload(value) == {"kind": "unknown"}


def test_health_needs_no_credentials():
    assert client.get("/health").status_code == 200
