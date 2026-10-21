import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix secrets are "whsec_" + base64(key). base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)


def sign(payload: str, timestamp: str, msg_id: str) -> str:
    """base64(HMAC_SHA256(base64Decode(secret), f"{id}.{timestamp}.{payload}"))"""
    key = base64.b64decode(TEST_SECRET.split("_")[1])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def new_id() -> str:
    return "msg_" + secrets.token_hex(12)


def signed(payload: str, ts: str = None, msg_id: str = None) -> dict:
    ts = ts or now()
    msg_id = msg_id or new_id()
    return {"svix-id": msg_id, "svix-timestamp": ts, "svix-signature": sign(payload, ts, msg_id)}


def post(payload: str, headers: dict):
    return client.post(
        "/webhooks/gopuff",
        content=payload,
        headers={"content-type": "application/json", **headers},
    )


def order_v2(status: str) -> str:
    return json.dumps(
        {"order": {"id": "0123456789", "location_id": 482, "partner_order_id": "ABC-512351",
                   "status": status, "cancel_reason": None}}
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("GOPUFF_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_order_status_v2():
    p = order_v2("Delivery")
    r = post(p, signed(p))
    assert r.status_code == 200
    assert r.json()["kind"] == "order"


def test_order_finished_delivered():
    p = order_v2("Finished")
    assert post(p, signed(p)).status_code == 200


def test_order_cancelled():
    p = json.dumps({"order": {"id": "1", "status": "Cancelled", "cancel_reason": "customer"}})
    assert post(p, signed(p)).status_code == 200


def test_delivery_status():
    p = json.dumps({"id": "1", "driver": {"location": {"latitude": 37.7, "longitude": -122.4}},
                    "partner_order_id": "A"})
    r = post(p, signed(p))
    assert r.status_code == 200
    assert r.json()["kind"] == "delivery_status"


def test_delivery_eta():
    p = json.dumps({"id": "1", "partner_order_id": "A",
                    "expected_delivery_time": {"min": "2025-08-21T18:35:00.000Z",
                                               "max": "2025-08-21T18:50:00.000Z"}})
    r = post(p, signed(p))
    assert r.status_code == 200
    assert r.json()["kind"] == "delivery_eta"


def test_webhook_header_aliases():
    p = order_v2("Packed")
    ts, msg_id = now(), new_id()
    r = post(p, {"webhook-id": msg_id, "webhook-timestamp": ts, "webhook-signature": sign(p, ts, msg_id)})
    assert r.status_code == 200


def test_multiple_signatures_rotation():
    p = order_v2("Packed")
    ts, msg_id = now(), new_id()
    r = post(p, {"svix-id": msg_id, "svix-timestamp": ts,
                 "svix-signature": f"v1,aW52YWxpZA== {sign(p, ts, msg_id)}"})
    assert r.status_code == 200


def test_unknown_payload():
    p = json.dumps({"hello": "world"})
    r = post(p, signed(p))
    assert r.status_code == 200
    assert r.json()["kind"] == "unknown"


def test_missing_headers():
    r = post(order_v2("Packed"), {})
    assert r.status_code == 400
    assert "Missing required" in r.json()["detail"]


def test_invalid_signature():
    r = post(order_v2("Packed"), {"svix-id": new_id(), "svix-timestamp": now(),
                                  "svix-signature": "v1,aW52YWxpZA=="})
    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid signature"


def test_tampered_body():
    headers = signed(order_v2("Packed"))
    assert post(order_v2("Finished"), headers).status_code == 400


def test_accepts_old_timestamp_by_default(monkeypatch):
    # Retries and replays keep the original timestamp, so the window is off by default
    monkeypatch.delenv("GOPUFF_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
    old = str(int(time.time()) - 3600)
    p = order_v2("Packed")
    r = post(p, signed(p, ts=old))
    assert r.status_code == 200


def test_rejects_old_timestamp_when_window_set(monkeypatch):
    monkeypatch.setenv("GOPUFF_TIMESTAMP_TOLERANCE_SECONDS", "300")
    old = str(int(time.time()) - 3600)
    p = order_v2("Packed")
    r = post(p, signed(p, ts=old))
    assert r.status_code == 400
    assert r.json()["detail"] == "Timestamp too old"


def test_non_numeric_window_treated_as_zero(monkeypatch):
    monkeypatch.setenv("GOPUFF_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
    old = str(int(time.time()) - 3600)
    p = order_v2("Packed")
    r = post(p, signed(p, ts=old))
    assert r.status_code == 200


def test_signed_non_json_body():
    p = "not json"
    r = post(p, signed(p))
    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid JSON"
