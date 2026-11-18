# Generated with: flutterwave-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
from itertools import count

import pytest

# Test-only secret hash (you choose it in Settings > Webhooks).
SECRET_HASH = "flw-test-secret-hash-7c1e"
os.environ["FLUTTERWAVE_SECRET_HASH"] = SECRET_HASH

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_flutterwave_webhook  # noqa: E402

client = TestClient(app)
_counter = count(1)


def sign_v4(raw_body: str, secret: str = SECRET_HASH) -> str:
    """Sign like Flutterwave v4: base64 HMAC-SHA256 of the raw body."""
    return base64.b64encode(hmac.new(secret.encode(), raw_body.encode(), hashlib.sha256).digest()).decode()


def next_id() -> str:
    return f"wbk_test{time.time_ns()}{next(_counter)}"


def v4_charge(webhook_id=None) -> str:
    return json.dumps(
        {
            "id": webhook_id or next_id(),
            "timestamp": 1735116884019,
            "type": "charge.completed",
            "data": {"id": "chg_Hq4oBRTJ4r", "amount": 2500, "currency": "KES", "status": "succeeded"},
        }
    )


def v4_transfer() -> str:
    return json.dumps(
        {
            "webhook_id": next_id(),
            "timestamp": 1739877172874,
            "type": "transfer.disburse",
            "data": {"id": "trf_yMZATJ11yVPNkZ", "type": "BANK", "amount": 50000, "status": "SUCCESSFUL"},
        }
    )


def v3_charge(status="successful") -> str:
    return json.dumps(
        {
            "event": "charge.completed",
            "data": {"id": 285959875, "tx_ref": "Links-616626414629", "amount": 100, "currency": "NGN", "status": status},
            "event.type": "CARD_TRANSACTION",
        }
    )


V3_VIRTUAL_CARD = json.dumps(
    {
        "TransactionId": "9998d447-9159-4591-9661-aa7f1458d91b",
        "Status": "Successful",
        "Amount": 0.2075,
        "Type": "Debit",
        "CardId": "ccb40595-eaad-4a8f-bb9a-74ae245b12bb",
    }
)


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/flutterwave", content=raw_body, headers={"content-type": "application/json", **headers})


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("FLUTTERWAVE_SECRET_HASH", SECRET_HASH)


def test_documented_test_vector():
    body = b'{"webhook_id":"wbk_test0001","timestamp":1739877172874,"type":"charge.completed","data":{"id":"chg_test0001","status":"succeeded"}}'
    headers = {"flutterwave-signature": "XyZb/PVeYo0px7D4KQpa/nS7KkPGH1fK7X84YdQO2Ms="}
    assert verify_flutterwave_webhook(body, headers, SECRET_HASH) == "v4"


def test_verify_v3_and_failures():
    assert verify_flutterwave_webhook(b"{}", {"verif-hash": SECRET_HASH}, SECRET_HASH) == "v3"
    assert verify_flutterwave_webhook(b"{}", {"verif-hash": "nope"}, SECRET_HASH) is None
    assert verify_flutterwave_webhook(b"{}", {}, SECRET_HASH) is None
    assert verify_flutterwave_webhook(b"{}", {"verif-hash": SECRET_HASH}, "") is None


def test_v4_charge_completed(caplog):
    caplog.set_level("INFO")
    body = v4_charge()
    res = post(body, {"flutterwave-signature": sign_v4(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True, "version": "v4"}
    assert "Charge chg_Hq4oBRTJ4r succeeded: 2500 KES" in caplog.text


def test_v4_transfer_disburse(caplog):
    caplog.set_level("INFO")
    body = v4_transfer()
    assert post(body, {"flutterwave-signature": sign_v4(body)}).status_code == 200
    assert "Transfer trf_yMZATJ11yVPNkZ SUCCESSFUL" in caplog.text


def test_v4_rejects_other_secret():
    body = v4_charge()
    assert post(body, {"flutterwave-signature": sign_v4(body, "other")}).status_code == 401


def test_v4_rejects_tampered_body():
    body = v4_charge()
    assert post(body.replace("2500", "250000"), {"flutterwave-signature": sign_v4(body)}).status_code == 401


def test_v4_rejects_hex_digest():
    body = v4_charge()
    hex_sig = hmac.new(SECRET_HASH.encode(), body.encode(), hashlib.sha256).hexdigest()
    assert post(body, {"flutterwave-signature": hex_sig}).status_code == 401


def test_v4_rejects_secret_hash_as_signature():
    assert post(v4_charge(), {"flutterwave-signature": SECRET_HASH}).status_code == 401


def test_v4_does_not_fall_back_to_verif_hash():
    body = v4_charge()
    headers = {"flutterwave-signature": sign_v4(body, "wrong"), "verif-hash": SECRET_HASH}
    assert post(body, headers).status_code == 401


def test_v4_duplicate_webhook_id():
    body = v4_charge("wbk_duplicate_check_1")
    headers = {"flutterwave-signature": sign_v4(body)}
    assert post(body, headers).status_code == 200
    assert post(body, headers).json() == {"received": True, "duplicate": True}


def test_v3_charge_completed():
    res = post(v3_charge(), {"verif-hash": SECRET_HASH})
    assert res.status_code == 200
    assert res.json() == {"received": True, "version": "v3"}


def test_v3_virtual_card_without_event(caplog):
    caplog.set_level("INFO")
    assert post(V3_VIRTUAL_CARD, {"verif-hash": SECRET_HASH}).status_code == 200
    assert "Virtual card ccb40595" in caplog.text


def test_v3_rejects_wrong_verif_hash():
    assert post(v3_charge(), {"verif-hash": "wrong-hash"}).status_code == 401


def test_v3_dedupes_on_event_id_status():
    body = v3_charge("failed")
    post(body, {"verif-hash": SECRET_HASH})
    assert post(body, {"verif-hash": SECRET_HASH}).json() == {"received": True, "duplicate": True}


def test_rejects_neither_header():
    assert post(v4_charge(), {}).status_code == 401


def test_rejects_invalid_json_after_valid_signature():
    body = '{"type": "charge.completed",'
    assert post(body, {"flutterwave-signature": sign_v4(body)}).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("FLUTTERWAVE_SECRET_HASH")
    body = v4_charge()
    assert post(body, {"flutterwave-signature": sign_v4(body)}).status_code == 500
