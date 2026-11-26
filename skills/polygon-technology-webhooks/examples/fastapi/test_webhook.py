# Generated with: polygon-technology-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# Synthetic signing key. OMS uses the cleartext signingKey as-is (UTF-8 bytes).
SIGNING_KEY = "oms_synthetic_signing_key_3f9a1c7e"
os.environ["OMS_WEBHOOK_SIGNING_KEY"] = SIGNING_KEY

from fastapi.testclient import TestClient  # noqa: E402

from main import app, effective_sub_status, reset_store, verify_oms_signature  # noqa: E402

client = TestClient(app)

T = 1767225600


def envelope(**overrides):
    event = {
        "id": "evt_01m48wyjzsf4sadyyn9ts7wdrr",
        "idempotencyKey": "36edb21c-5b34-5dcd-be8c-d1942d27e62b",
        "type": "transfer.statusChanged",
        "createdAt": "2026-10-06T15:22:40.505Z",
        "schema": "v1",
        "data": {
            "resource": {"id": "trf_01mt5c8e0g2j4k6m8p0r2t4v6x", "status": "settled"},
            "previousStatus": "pending",
        },
    }
    event.update(overrides)
    return json.dumps(event)


TRANSACTION = json.dumps(
    {
        "id": "evt_01m3vwfty8f9a96p8vzvc8yc5n",
        "idempotencyKey": "9ab1f992-0f66-5ecf-be2d-dc7efa707933",
        "type": "transaction.statusChanged",
        "createdAt": "2026-10-01T14:04:29.512Z",
        "schema": "v1",
        "data": {
            "resource": {
                "id": "txn_01mqyagza72777t0paefp51exd",
                "status": "processing",
                "subStatus": "processing.awaitingFiatOut",
            },
            "previousStatus": "processing",
        },
    }
)


def sign(body, key=SIGNING_KEY, t=None):
    """Build a Webhook-Signature header exactly as OMS does."""
    t = int(time.time()) if t is None else t
    v1 = hmac.new(key.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def post(body, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["Webhook-Signature"] = signature
    return client.post("/webhooks/polygon-technology", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("OMS_WEBHOOK_SIGNING_KEY", SIGNING_KEY)
    reset_store()


# --- verify_oms_signature ---------------------------------------------------


def test_docs_fixture_shape_is_accepted():
    body = envelope()
    assert verify_oms_signature(body, sign(body, t=T), SIGNING_KEY, now=T)


def test_parts_are_read_by_key_not_position():
    body = envelope()
    v1 = sign(body, t=T).split("v1=")[1]
    assert verify_oms_signature(body, f"v1={v1}, t={T}", SIGNING_KEY, now=T)


def test_missing_t_or_v1_is_rejected():
    body = envelope()
    v1 = sign(body, t=T).split("v1=")[1]
    assert not verify_oms_signature(body, f"v1={v1}", SIGNING_KEY, now=T)
    assert not verify_oms_signature(body, f"t={T}", SIGNING_KEY, now=T)


def test_base64_digest_is_rejected():
    body = envelope()
    digest = hmac.new(SIGNING_KEY.encode(), f"{T}.{body}".encode(), hashlib.sha256).digest()
    assert not verify_oms_signature(body, f"t={T},v1={base64.b64encode(digest).decode()}", SIGNING_KEY, now=T)


def test_hmac_over_body_alone_is_rejected():
    body = envelope()
    v1 = hmac.new(SIGNING_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()
    assert not verify_oms_signature(body, f"t={T},v1={v1}", SIGNING_KEY, now=T)


def test_short_signature_is_rejected():
    assert not verify_oms_signature(envelope(), f"t={T},v1=abcd", SIGNING_KEY, now=T)


def test_window_applies_in_both_directions():
    body = envelope()
    header = sign(body, t=T)
    assert verify_oms_signature(body, header, SIGNING_KEY, now=T + 300)
    assert not verify_oms_signature(body, header, SIGNING_KEY, now=T + 301)  # stale
    assert not verify_oms_signature(body, header, SIGNING_KEY, now=T - 301)  # future-dated


def test_unknown_sub_status_falls_back_to_prefix():
    assert effective_sub_status("processing.payoutHeld") == "processing"
    assert effective_sub_status("processing.underReview") == "processing.underReview"


# --- POST /webhooks/polygon-technology --------------------------------------


def test_valid_delivery_is_accepted():
    body = envelope()
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {
        "received": True,
        "id": "evt_01m48wyjzsf4sadyyn9ts7wdrr",
        "type": "transfer.statusChanged",
        "result": "processed",
    }


def test_sub_status_only_transaction_change_is_processed(caplog):
    caplog.set_level("INFO", logger="polygon-technology-webhooks")
    res = post(TRANSACTION, sign(TRANSACTION))
    assert res.status_code == 200
    assert res.json()["result"] == "processed"
    assert "sub-status now processing" in caplog.text


def test_other_key_is_rejected():
    body = envelope()
    assert post(body, sign(body, key="wrong_key")).status_code == 401


def test_tampered_body_is_rejected():
    body = envelope()
    assert post(body.replace("settled", "failed"), sign(body)).status_code == 401


def test_missing_header_is_rejected():
    assert post(envelope()).status_code == 401


def test_stale_timestamp_is_rejected():
    body = envelope()
    assert post(body, sign(body, t=int(time.time()) - 600)).status_code == 401


def test_retry_with_same_id_is_a_duplicate():
    body = envelope()
    post(body, sign(body))
    assert post(body, sign(body)).json()["result"] == "duplicate"


def test_same_idempotency_key_with_new_id_is_a_duplicate():
    first = envelope()
    second = envelope(id="evt_01m48wyjzsf4sadyyn9ts7wdzz")
    post(first, sign(first))
    assert post(second, sign(second)).json()["result"] == "duplicate"


def test_older_event_for_resource_is_stale():
    newer = envelope()
    older = envelope(
        id="evt_01m48wyjzsf4sadyyn9ts7wd000",
        idempotencyKey="00000000-5b34-5dcd-be8c-d1942d27e62b",
        createdAt="2026-10-06T15:22:39.100Z",
    )
    post(newer, sign(newer))
    assert post(older, sign(older)).json()["result"] == "stale"


def test_unknown_type_is_acknowledged():
    body = envelope(type="somethingNew.created")
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json()["result"] == "ignored"


def test_pre_v1_event_is_ignored():
    body = envelope(schema="")
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json()["result"] == "ignored"


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_signing_key(monkeypatch):
    monkeypatch.delenv("OMS_WEBHOOK_SIGNING_KEY")
    body = envelope()
    assert post(body, sign(body)).status_code == 500
