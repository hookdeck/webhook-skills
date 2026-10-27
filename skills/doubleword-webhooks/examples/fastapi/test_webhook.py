import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

KEY = b"doubleword_test_signing_key_32by"  # 32 raw bytes
SECRET = "whsec_" + base64.b64encode(KEY).decode()  # whsec_ + base64, as shown in the profile

COMPLETED = {
    "type": "batch.completed",
    "timestamp": "2026-01-15T12:00:00Z",
    "data": {
        "batch_id": "batch_29cd13af-5ce9-487e-98ff-4eb6730c12b4",
        "status": "completed",
        "request_counts": {"total": 100, "completed": 98, "failed": 2, "cancelled": 0},
        "output_file_id": "file_b4213e44-3c85-4689-9cae-e6d986785143",
        "error_file_id": "file_49fdc045-77a8-409b-bb3e-d661df05f9fb",
        "created_at": "2026-01-15T10:00:00Z",
        "finished_at": "2026-01-15T12:00:00Z",
    },
}
FAILED = {**COMPLETED, "type": "batch.failed", "data": {**COMPLETED["data"], "status": "failed"}}


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("DOUBLEWORD_WEBHOOK_SECRET", SECRET)


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


def sign(body: str, msg_id="msg_test_1", ts=None, key=KEY):
    ts = str(int(time.time()) if ts is None else ts)
    digest = hmac.new(key, f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
    return {"id": msg_id, "ts": ts, "sig": "v1," + base64.b64encode(digest).decode()}


def wh_headers(s, prefix="webhook"):
    return {f"{prefix}-id": s["id"], f"{prefix}-timestamp": s["ts"], f"{prefix}-signature": s["sig"]}


def post(client, body, headers, content_type="application/json"):
    return client.post(
        "/webhooks/doubleword",
        content=body,
        headers={"content-type": content_type, **headers},
    )


def test_accepts_batch_completed(client):
    body = json.dumps(COMPLETED)
    res = post(client, body, wh_headers(sign(body)))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_batch_failed(client):
    body = json.dumps(FAILED)
    assert post(client, body, wh_headers(sign(body))).status_code == 200


def test_acknowledges_unknown_event_type(client):
    body = json.dumps({**COMPLETED, "type": "batch.cancelled"})
    assert post(client, body, wh_headers(sign(body))).status_code == 200


def test_accepts_svix_prefixed_headers(client):
    body = json.dumps(COMPLETED)
    assert post(client, body, wh_headers(sign(body), "svix")).status_code == 200


def test_accepts_one_matching_signature_among_several(client):
    body = json.dumps(COMPLETED)
    s = sign(body)
    other = sign(body, key=b"some_other_key_bytes_000000000000")
    headers = wh_headers({**s, "sig": f"{other['sig']} {s['sig']}"})
    assert post(client, body, headers).status_code == 200


def test_accepts_non_whsec_secret_as_raw_bytes(client, monkeypatch):
    monkeypatch.setenv("DOUBLEWORD_WEBHOOK_SECRET", "plain_raw_secret")
    body = json.dumps(COMPLETED)
    headers = wh_headers(sign(body, key=b"plain_raw_secret"))
    assert post(client, body, headers).status_code == 200


def test_verifies_exact_bytes(client):
    body = json.dumps(COMPLETED, indent=2)
    assert post(client, body, wh_headers(sign(body))).status_code == 200


def test_verifies_any_content_type(client):
    body = json.dumps(COMPLETED)
    assert post(client, body, wh_headers(sign(body)), "text/plain").status_code == 200


def test_rejects_invalid_signature(client):
    body = json.dumps(COMPLETED)
    headers = wh_headers({**sign(body), "sig": "v1,aW52YWxpZA=="})
    assert post(client, body, headers).status_code == 400


def test_rejects_malformed_signature(client):
    body = json.dumps(COMPLETED)
    headers = wh_headers({**sign(body), "sig": "v1,%%%not-base64%%%"})
    assert post(client, body, headers).status_code == 400


def test_rejects_tampered_body(client):
    body = json.dumps(COMPLETED)
    assert post(client, body.replace("98", "99"), wh_headers(sign(body))).status_code == 400


def test_rejects_signature_from_another_key(client):
    body = json.dumps(COMPLETED)
    headers = wh_headers(sign(body, key=b"wrong_key_wrong_key_wrong_key_12"))
    assert post(client, body, headers).status_code == 400


def test_rejects_timestamp_outside_window(client):
    body = json.dumps(COMPLETED)
    headers = wh_headers(sign(body, ts=int(time.time()) - 600))
    assert post(client, body, headers).status_code == 400


def test_rejects_missing_headers(client):
    assert post(client, json.dumps(COMPLETED), {}).status_code == 400


def test_rejects_v1a_only_signature(client):
    body = json.dumps(COMPLETED)
    s = sign(body)
    headers = wh_headers({**s, "sig": s["sig"].replace("v1,", "v1a,")})
    assert post(client, body, headers).status_code == 400


def test_fails_closed_without_secret(client, monkeypatch):
    monkeypatch.delenv("DOUBLEWORD_WEBHOOK_SECRET")
    body = json.dumps(COMPLETED)
    assert post(client, body, wh_headers(sign(body))).status_code == 500


def test_rejects_verified_non_json_body(client):
    body = "not json"
    assert post(client, body, wh_headers(sign(body))).status_code == 400
