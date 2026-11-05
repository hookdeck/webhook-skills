import base64
import copy
import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# The example secret from the Papergames security docs: 'whsec_' + base64 key
TEST_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
OTHER_SECRET = "whsec_b3RoZXJfc2VjcmV0X2tleQ=="

# The documented game-session payloads (developers.papergames.io/docs/webhooks/events)
GAME_STARTED = {
    "eventType": "game.started",
    "payload": {
        "createdAt": "2023-11-03T10:34:28.191Z",
        "gamesPlayed": 0,
        "players": [
            {"externalId": "PEP_001", "name": "Pepito", "score": 0},
            {"externalId": "JD_001", "name": "John Doe", "score": 0},
        ],
        "status": "playing",
        "uid": "8qgmUmqJj",
        "updatedAt": "2023-11-03T10:34:35.508Z",
    },
}

GAME_FINISHED = {
    "eventType": "game.finished",
    "payload": {
        "createdAt": "2023-11-03T10:34:28.191Z",
        "gamesPlayed": 1,
        "players": [
            {"externalId": "PEP_001", "name": "Pepito", "score": 1},
            {"externalId": "JD_001", "name": "John Doe", "score": 0},
        ],
        "status": "playing",
        "uid": "8qgmUmqJj",
        "updatedAt": "2023-11-03T10:34:57.484Z",
    },
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix: base64(HMAC-SHA256(base64-decoded secret, '{svix-id}.{svix-timestamp}.{body}'))."""
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id=None, timestamp=None, signature=None, headers=None):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex[:24]}"
    timestamp = timestamp or now()
    if headers is None:
        headers = {
            "svix-id": msg_id,
            "svix-timestamp": timestamp,
            "svix-signature": signature or sign(payload, msg_id, timestamp),
        }
    return client.post(
        "/webhooks/papergames",
        content=payload.encode(),
        headers={"content-type": "application/json", **headers},
    )


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("PAPERGAMES_WEBHOOK_SECRET", TEST_SECRET)
    monkeypatch.delenv("PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_health():
    assert client.get("/health").status_code == 200


def test_handles_game_started(capsys):
    res = send(json.dumps(GAME_STARTED))
    assert res.status_code == 200
    assert res.json() == {"received": True}
    out = capsys.readouterr().out
    assert "Game started in session 8qgmUmqJj" in out
    assert "Pepito (PEP_001)" in out


def test_handles_game_finished_and_derives_leader(capsys):
    res = send(json.dumps(GAME_FINISHED))
    assert res.status_code == 200
    out = capsys.readouterr().out
    assert "Game finished in session 8qgmUmqJj" in out
    assert "Leading: Pepito (PEP_001) with score 1" in out


def test_falls_back_to_name_without_external_id(capsys):
    body = copy.deepcopy(GAME_STARTED)
    body["payload"]["players"] = [{"name": "Guest", "score": 0}]
    assert send(json.dumps(body)).status_code == 200
    assert "Players: Guest" in capsys.readouterr().out


def test_tolerates_webhook_payload_wrapper(capsys):
    assert send(json.dumps({"webhookPayload": GAME_FINISHED})).status_code == 200
    assert "Game finished in session 8qgmUmqJj" in capsys.readouterr().out


def test_acknowledges_unknown_event_type(capsys):
    res = send(json.dumps({"eventType": "game.cancelled", "payload": {"uid": "x"}}))
    assert res.status_code == 200
    assert "Unhandled Papergames event type: game.cancelled" in capsys.readouterr().out


def test_fixed_signature_vector(monkeypatch):
    # Computed independently with openssl; the tolerance is disabled because the timestamp is fixed
    monkeypatch.setenv("PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS", "0")
    res = send(
        '{"eventType":"game.started","payload":{"uid":"8qgmUmqJj"}}',
        msg_id="msg_2KWPBgLlAfxdpx2AI54pPJ85f4W",
        timestamp="1699007668",
        signature="v1,BXFMEbfDNtVqz0PXYTcA6U1v7YTjH7mjbbpo/XBfvxw=",
    )
    assert res.status_code == 200


def test_verifies_exact_raw_bytes():
    payload = '{ "eventType" : "game.started",\n  "payload": {"uid": "8qgmUmqJj", "players": []} }'
    assert send(payload).status_code == 200


def test_accepts_any_v1_entry_and_ignores_other_versions():
    payload = json.dumps(GAME_STARTED)
    msg_id, timestamp = "msg_rotation", now()
    good = sign(payload, msg_id, timestamp)
    old = sign(payload, msg_id, timestamp, OTHER_SECRET)
    res = send(payload, msg_id, timestamp, signature=f"{old} v2,{good[3:]} {good}")
    assert res.status_code == 200


def test_rejects_valid_digest_under_non_v1_tag():
    payload = json.dumps(GAME_STARTED)
    msg_id, timestamp = "msg_v2_only", now()
    res = send(payload, msg_id, timestamp, signature=f"v2,{sign(payload, msg_id, timestamp)[3:]}")
    assert res.status_code == 400


def test_rejects_missing_signature_header():
    res = send(json.dumps(GAME_STARTED), headers={"svix-id": "msg_1", "svix-timestamp": now()})
    assert res.status_code == 400


def test_ignores_webhook_prefixed_headers():
    payload = json.dumps(GAME_STARTED)
    timestamp = now()
    res = send(
        payload,
        headers={
            "webhook-id": "msg_1",
            "webhook-timestamp": timestamp,
            "webhook-signature": sign(payload, "msg_1", timestamp),
        },
    )
    assert res.status_code == 400


def test_rejects_invalid_signature():
    assert send(json.dumps(GAME_STARTED), signature="v1,aW52YWxpZA==").status_code == 400


def test_rejects_signature_from_another_secret():
    payload = json.dumps(GAME_STARTED)
    msg_id, timestamp = "msg_other", now()
    res = send(payload, msg_id, timestamp, signature=sign(payload, msg_id, timestamp, OTHER_SECRET))
    assert res.status_code == 400


def test_rejects_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(json.dumps(GAME_STARTED), msg_id, timestamp)
    assert send(json.dumps(GAME_FINISHED), msg_id, timestamp, signature=signature).status_code == 400


def test_rejects_signature_reused_with_different_id():
    payload = json.dumps(GAME_STARTED)
    timestamp = now()
    signature = sign(payload, "msg_original", timestamp)
    assert send(payload, "msg_swapped", timestamp, signature=signature).status_code == 400


def test_rejects_non_numeric_timestamp():
    assert send(json.dumps(GAME_STARTED), timestamp="yesterday").status_code == 400


def test_rejects_timestamp_outside_default_window():
    payload = json.dumps(GAME_STARTED)
    msg_id, timestamp = "msg_stale", str(int(time.time()) - 600)
    assert send(payload, msg_id, timestamp).status_code == 400


def test_accepts_old_timestamp_when_window_widened(monkeypatch):
    monkeypatch.setenv("PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS", "86400")
    payload = json.dumps(GAME_STARTED)
    msg_id, timestamp = "msg_late_retry", str(int(time.time()) - 7200)
    assert send(payload, msg_id, timestamp).status_code == 200


def test_rejects_verified_non_json_body():
    assert send("not json").status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("PAPERGAMES_WEBHOOK_SECRET")
    assert send(json.dumps(GAME_STARTED)).status_code == 500


def test_fails_closed_when_secret_decodes_to_nothing(monkeypatch):
    monkeypatch.setenv("PAPERGAMES_WEBHOOK_SECRET", "whsec_")
    assert send(json.dumps(GAME_STARTED)).status_code == 500


def test_decodes_secret_without_whsec_prefix(monkeypatch):
    monkeypatch.setenv("PAPERGAMES_WEBHOOK_SECRET", TEST_SECRET.removeprefix("whsec_"))
    assert send(json.dumps(GAME_STARTED)).status_code == 200
