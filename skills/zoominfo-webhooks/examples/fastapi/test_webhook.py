import json

import pytest
from fastapi.testclient import TestClient

from main import app, verify_zoominfo_token

TOKEN = "zi_test_token_0123456789abcdef"
PAYLOAD = json.dumps({"data": [{"id": 1, "email": "a@example.com"}]})
HEADERS = {"content-type": "application/json"}

client = TestClient(app)


@pytest.fixture(autouse=True)
def token(monkeypatch):
    monkeypatch.setenv("ZOOMINFO_WEBHOOK_TOKEN", TOKEN)


def post(body=PAYLOAD, **headers):
    return client.post("/webhooks/zoominfo", content=body, headers={**HEADERS, **headers})


def test_accepts_correct_token():
    res = post(**{"x-zoominfo-token": TOKEN})
    assert res.status_code == 200
    assert res.json() == {"received": True, "verified": True}


def test_rejects_wrong_token():
    assert post(**{"x-zoominfo-token": "wrong"}).status_code == 401


def test_rejects_token_of_different_length():
    assert post(**{"x-zoominfo-token": TOKEN + "x"}).status_code == 401


def test_rejects_missing_token():
    assert post().status_code == 401


def test_invalid_json_with_valid_token_is_400():
    assert post("not json", **{"x-zoominfo-token": TOKEN}).status_code == 400


def test_acknowledges_validate_sample_without_token_configured(monkeypatch):
    monkeypatch.delenv("ZOOMINFO_WEBHOOK_TOKEN")
    res = post()
    assert res.status_code == 200
    assert res.json() == {"received": True, "verified": False}


def test_verify_helper():
    assert verify_zoominfo_token(TOKEN, TOKEN)
    assert not verify_zoominfo_token("short", TOKEN)
    assert not verify_zoominfo_token(None, TOKEN)
    assert not verify_zoominfo_token(TOKEN, None)
