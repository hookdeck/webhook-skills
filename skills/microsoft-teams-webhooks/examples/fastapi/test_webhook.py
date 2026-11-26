# Generated with: microsoft-teams-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

import pytest

# Made-up security token (32 random-looking bytes, base64), shaped like the one Teams shows.
TOKEN = "zN0uIOo7AK9myNAQMhZ8PZNO2UZb9PXmx0V7r26UcOc="
os.environ["MICROSOFT_TEAMS_SECURITY_TOKEN"] = TOKEN

from fastapi.testclient import TestClient  # noqa: E402

from main import app, command_text, verify_teams_request  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, token: str = TOKEN) -> str:
    """Sign like Teams: HMAC-SHA256 of the raw body, keyed with the decoded token."""
    digest = hmac.new(base64.b64decode(token), raw_body.encode("utf-8"), hashlib.sha256).digest()
    return "HMAC " + base64.b64encode(digest).decode()


def activity(text: str = "<at>Helper</at> status") -> str:
    # Pretty-printed so a re-serialised body would not match.
    return json.dumps(
        {
            "type": "message",
            "id": "1731924900123",
            "timestamp": "2026-11-18T10:15:00.123Z",
            "channelId": "msteams",
            "from": {"id": "29:1Xh-test", "name": "Megan Bowen"},
            "conversation": {
                "isGroup": True,
                "conversationType": "channel",
                "id": "19:test@thread.tacv2;messageid=1731924900123",
            },
            "text": text,
            "textFormat": "plain",
        },
        indent=2,
    )


def post(raw_body: str, authorization=None):
    headers = {"Content-Type": "application/json"}
    if authorization is not None:
        headers["Authorization"] = authorization
    return client.post("/webhooks/microsoft-teams", content=raw_body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MICROSOFT_TEAMS_SECURITY_TOKEN", TOKEN)


def test_documented_test_vector():
    body = '{"type":"message","id":"1731924900123","text":"<at>Helper</at> status","from":{"name":"Megan Bowen"}}'
    header = "HMAC cOMdJKZIsWtg30Ac0WEteH+Xq4T2PR1Id7/qsO430kg="
    assert verify_teams_request(body, header, TOKEN)
    assert verify_teams_request(body.encode(), header, TOKEN)


def test_rejects_token_that_is_not_base64():
    body = activity()
    assert not verify_teams_request(body, sign(body), "not base64!")


def test_command_text_strips_mention_and_html():
    assert command_text("<at>Helper</at> status") == "status"
    assert command_text("<div><at>Helper</at>&nbsp;help</div>") == "help"


def test_valid_hmac_gets_teams_reply():
    body = activity()
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    assert res.json() == {"type": "message", "text": "Hi Megan Bowen, all systems are operational."}


def test_help_command():
    body = activity("<at>Helper</at> help")
    assert post(body, sign(body)).json() == {"type": "message", "text": "Commands: status, help"}


def test_unknown_command_is_not_echoed():
    body = activity("<at>Helper</at> <b>drop table</b>")
    assert post(body, sign(body)).json() == {"type": "message", "text": 'Unknown command. Try "help".'}


def test_accepts_lower_case_scheme():
    body = activity()
    assert post(body, sign(body).replace("HMAC", "hmac")).status_code == 200


def test_accepts_token_with_trailing_newline(monkeypatch):
    monkeypatch.setenv("MICROSOFT_TEAMS_SECURITY_TOKEN", TOKEN + "\n")
    body = activity()
    assert post(body, sign(body)).status_code == 200


def test_rejects_missing_header():
    assert post(activity()).status_code == 401


def test_rejects_other_scheme():
    body = activity()
    assert post(body, sign(body).replace("HMAC", "Bearer")).status_code == 401


def test_rejects_signature_keyed_with_undecoded_token():
    body = activity()
    digest = hmac.new(TOKEN.encode(), body.encode(), hashlib.sha256).digest()
    assert post(body, "HMAC " + base64.b64encode(digest).decode()).status_code == 401


def test_rejects_signature_from_another_token():
    other = base64.b64encode(hashlib.sha256(b"another-webhook").digest()).decode()
    body = activity()
    assert post(body, sign(body, other)).status_code == 401


def test_rejects_malformed_signature():
    assert post(activity(), "HMAC not*base64").status_code == 401


def test_rejects_tampered_body():
    body = activity()
    assert post(body.replace("status", "deploy"), sign(body)).status_code == 401


def test_rejects_reserialised_body():
    body = activity()
    compact = json.dumps(json.loads(body), separators=(",", ":"))
    assert post(compact, sign(body)).status_code == 401


def test_invalid_json_after_valid_hmac():
    body = '{"type": "message",'
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_token(monkeypatch):
    monkeypatch.delenv("MICROSOFT_TEAMS_SECURITY_TOKEN")
    body = activity()
    assert post(body, sign(body)).status_code == 500
