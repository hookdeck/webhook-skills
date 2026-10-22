import json

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_bringg_request

SECRET = "Bearer test_bringg_static_header_0123456789"

client = TestClient(app)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("BRINGG_WEBHOOK_SECRET", SECRET)
    monkeypatch.setenv("BRINGG_WEBHOOK_HEADER", "Authorization")


def sample_payload(event="task_created"):
    # Shape of a Bringg order webhook (abridged)
    return {"webhook_type": event, "id": 8503585, "title": "50 cases of Best Brand Soda", "status": 0}


def post(headers=None, body=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    return client.post(
        "/webhooks/bringg",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


def test_accepts_exact_value_including_bearer_prefix():
    res = post({"Authorization": SECRET})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_does_not_strip_bearer_prefix():
    assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401


def test_rejects_wrong_value_same_length():
    assert post({"Authorization": SECRET[:-1] + "x"}).status_code == 401


def test_rejects_wrong_value_different_length():
    assert post({"Authorization": SECRET + "extra"}).status_code == 401


def test_rejects_missing_header():
    assert post().status_code == 401


def test_rejects_everything_when_unconfigured(monkeypatch):
    monkeypatch.delenv("BRINGG_WEBHOOK_SECRET")
    assert post({"Authorization": "undefined"}).status_code == 401


def test_custom_header_name_case_insensitive(monkeypatch):
    monkeypatch.setenv("BRINGG_WEBHOOK_HEADER", "Application-Key")
    monkeypatch.setenv("BRINGG_WEBHOOK_SECRET", "abc123-static-key")
    assert post({"application-key": "abc123-static-key"}).status_code == 200
    assert post({"APPLICATION-KEY": "abc123-static-key"}).status_code == 200
    assert post({"Authorization": "abc123-static-key"}).status_code == 401


def test_non_ascii_secret_does_not_raise():
    # Starlette decodes header bytes as Latin-1, so use Latin-1 characters here
    config = {"BRINGG_WEBHOOK_SECRET": "sécret-ñ"}
    assert verify_bringg_request(Headers({"authorization": "sécret-ñ"}), config) is True
    assert verify_bringg_request(Headers({"authorization": "secret-n"}), config) is False


def test_accepts_any_content_type():
    res = post({"Authorization": SECRET}, content_type="text/plain")
    assert res.status_code == 200


def test_authenticates_before_parsing():
    assert post({"Authorization": "nope"}, body="not json").status_code == 401


def test_invalid_json_returns_400():
    assert post({"Authorization": SECRET}, body="not json").status_code == 400


def test_non_object_body_returns_400():
    assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400


@pytest.mark.parametrize(
    "event",
    ["task_created", "task_done", "task_cancelled", "driver_assigned", "way_point_arrived", "note_created"],
)
def test_handles_event(event, capsys):
    res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(event)))
    assert res.status_code == 200
    assert "Unhandled event" not in capsys.readouterr().out


def test_unknown_event_logged_and_200(capsys):
    res = post({"Authorization": SECRET}, body=json.dumps(sample_payload("scan_created")))
    assert res.status_code == 200
    assert "Unhandled event: scan_created" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
