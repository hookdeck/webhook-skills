# Generated with: worldline-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import uuid

import pytest
from fastapi.testclient import TestClient

import main
from main import (
    CONNECT_EVENTS,
    DIRECT_EVENTS,
    app,
    process_event,
    resource_key_for,
    verify_worldline_signature,
)

# Synthetic webhooks keys. Real ones come from the Connect Configuration Center
# ("webhooks keys") or the Direct Merchant Portal (Developer > Webhooks).
KEY_ID = "test-webhooks-key-id-new"
SECRET = "test-webhooks-secret-key-new"
OLD_KEY_ID = "test-webhooks-key-id-old"
OLD_SECRET = "test-webhooks-secret-key-old"

client = TestClient(app)


def make_event(**overrides):
    # Envelope from the Connect event-structure page; payment fields from the docs sample.
    event = {
        "apiVersion": "v1",
        "id": str(uuid.uuid4()),
        "created": "2017-09-14T17:14:39.688+0200",
        "merchantId": "20000",
        "type": "payment.created",
        "payment": {
            "id": "000000200000000105460000100001",
            "paymentOutput": {
                "amountOfMoney": {"amount": 1000, "currencyCode": "EUR"},
                "references": {"paymentReference": "0"},
                "paymentMethod": "card",
            },
            "status": "CREATED",
            "statusOutput": {
                "isCancellable": True,
                "statusCategory": "CREATED",
                "statusCode": 0,
                "isAuthorized": False,
            },
        },
    }
    event.update(overrides)
    return event


def make_body(**overrides):
    return json.dumps(make_event(**overrides), separators=(",", ":"))


def sign(body, secret=SECRET):
    if isinstance(body, str):
        body = body.encode("utf-8")
    return base64.b64encode(hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()).decode()


def post(body, signature="__auto__", key_id=KEY_ID, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        h["X-GCS-Signature"] = sign(body) if signature == "__auto__" else signature
    if key_id is not None:
        h["X-GCS-KeyId"] = key_id
    return client.post("/webhooks/worldline", content=body, headers=h)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("WORLDLINE_WEBHOOK_KEY_ID", KEY_ID)
    monkeypatch.setenv("WORLDLINE_WEBHOOK_SECRET", SECRET)
    for var in (
        "WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS",
        "WORLDLINE_WEBHOOK_SECRET_PREVIOUS",
        "WORLDLINE_CUSTOM_HEADER_NAME",
        "WORLDLINE_CUSTOM_HEADER_VALUE",
    ):
        monkeypatch.delenv(var, raising=False)
    main.seen_event_ids.clear()
    processed = []
    monkeypatch.setattr(main, "process_event", lambda event: processed.append(event))
    return processed


# --- verify_worldline_signature -------------------------------------------------


def test_accepts_base64_hmac_of_raw_body():
    body = make_body()
    assert verify_worldline_signature(body, sign(body), SECRET)


def test_rejects_hex_digest():
    body = make_body()
    hex_sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    assert not verify_worldline_signature(body, hex_sig, SECRET)


def test_rejects_signature_over_reserialised_json():
    body = make_body()
    pretty = json.dumps(json.loads(body), indent=2)
    assert not verify_worldline_signature(body, sign(pretty), SECRET)


def test_rejects_truncated_signature():
    body = make_body()
    assert not verify_worldline_signature(body, sign(body)[:20], SECRET)


def test_empty_string_has_a_valid_signature_too():
    # Direct's ValidateWebhookCredentials self-test sends exactly this value.
    assert verify_worldline_signature(b"", sign(b""), SECRET)


# --- GET: Connect endpoint verification -----------------------------------------


def test_get_echoes_verification_header_as_plain_text():
    res = client.get(
        "/webhooks/worldline", headers={"X-GCS-Webhooks-Endpoint-Verification": "r4nd0m-Str1ng"}
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    assert res.text == "r4nd0m-Str1ng"


def test_get_needs_no_signature_or_secret(monkeypatch):
    monkeypatch.delenv("WORLDLINE_WEBHOOK_SECRET")
    res = client.get("/webhooks/worldline", headers={"X-GCS-Webhooks-Endpoint-Verification": "abc"})
    assert res.status_code == 200
    assert res.text == "abc"


def test_get_without_header_returns_400():
    assert client.get("/webhooks/worldline").status_code == 400


# --- POST -----------------------------------------------------------------------


def test_valid_signature_is_accepted_and_processed(env):
    body = make_body()
    res = post(body)
    assert res.status_code == 200
    assert res.json() == {"received": True, "id": json.loads(body)["id"], "type": "payment.created"}
    assert len(env) == 1
    assert env[0]["payment"]["paymentOutput"]["amountOfMoney"] == {"amount": 1000, "currencyCode": "EUR"}


def test_pretty_printed_body_verifies_on_raw_bytes():
    assert post(json.dumps(make_event(), indent=2)).status_code == 200


def test_every_connect_event_is_accepted(env):
    assert len(CONNECT_EVENTS) == 57  # 56 table rows + payment.paid_increment
    for event_type in CONNECT_EVENTS:
        res = post(make_body(type=event_type))
        assert res.status_code == 200
        assert res.json()["type"] == event_type
    assert len(env) == 57


def test_every_direct_event_is_accepted():
    assert len(DIRECT_EVENTS) == 20
    for event_type in DIRECT_EVENTS:
        res = post(make_body(type=event_type, merchantId="TESTCIMCREDITCARDS"))
        assert res.status_code == 200
        assert res.json()["type"] == event_type


def test_older_key_accepted_during_rotation(monkeypatch):
    monkeypatch.setenv("WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS", OLD_KEY_ID)
    monkeypatch.setenv("WORLDLINE_WEBHOOK_SECRET_PREVIOUS", OLD_SECRET)
    body = make_body()
    assert post(body, signature=sign(body, OLD_SECRET), key_id=OLD_KEY_ID).status_code == 200


def test_unknown_key_id_rejected_even_if_signature_matches_configured_secret():
    res = post(make_body(), key_id="some-other-key")
    assert res.status_code == 401
    assert res.json()["detail"] == "Unknown key id"


def test_signature_from_other_keys_secret_rejected(monkeypatch):
    monkeypatch.setenv("WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS", OLD_KEY_ID)
    monkeypatch.setenv("WORLDLINE_WEBHOOK_SECRET_PREVIOUS", OLD_SECRET)
    body = make_body()
    assert post(body, signature=sign(body, OLD_SECRET), key_id=KEY_ID).status_code == 401


def test_missing_signature_or_key_id_is_401():
    assert post(make_body(), signature=None).status_code == 401
    assert post(make_body(), key_id=None).status_code == 401


def test_tampered_body_rejected():
    body = make_body()
    tampered = body.replace('"amount":1000', '"amount":1')
    assert post(tampered, signature=sign(body)).status_code == 401


def test_malformed_signature_is_401():
    assert post(make_body(), signature="abc").status_code == 401


def test_fails_closed_when_secret_unset(monkeypatch, env):
    monkeypatch.delenv("WORLDLINE_WEBHOOK_SECRET")
    assert post(make_body()).status_code == 401
    assert env == []


def test_correctly_signed_empty_body_is_400():
    assert post("").status_code == 400


def test_invalid_json_after_valid_signature_is_400():
    assert post('{"truncated": ').status_code == 400


def test_single_element_array_is_unwrapped(env):
    assert post(json.dumps([make_event()])).status_code == 200
    assert len(env) == 1


def test_unexpected_api_version_is_logged_and_accepted(env):
    assert post(make_body(apiVersion="v2")).status_code == 200
    assert len(env) == 1


def test_redelivery_is_deduped_on_id_whatever_retry_count_says(env):
    body = make_body()
    post(body, headers={"retry-count": "0"})
    res = post(body, headers={"retry-count": "1"})
    assert res.status_code == 200
    assert res.json()["duplicate"] is True
    assert len(env) == 1


def test_test_prefixed_id_is_acknowledged_not_processed(env):
    res = post(make_body(id="TEST97a4fcdf-9a08-4a59-a0c0-69bfd7e1d59d"))
    assert res.status_code == 200
    assert res.json()["test"] is True
    assert env == []


def test_unknown_type_returns_200_and_is_ignored(env):
    res = post(make_body(type="payment.some_future_event"))
    assert res.status_code == 200
    assert res.json()["ignored"] == "unknown type"
    assert env == []


def test_custom_header_checked_in_addition_to_hmac(monkeypatch):
    monkeypatch.setenv("WORLDLINE_CUSTOM_HEADER_NAME", "X-My-Webhook-Token")
    monkeypatch.setenv("WORLDLINE_CUSTOM_HEADER_VALUE", "shared-token-value")
    assert post(make_body()).status_code == 401
    assert post(make_body(), headers={"X-My-Webhook-Token": "wrong"}).status_code == 401
    ok = post(make_body(), headers={"X-My-Webhook-Token": "shared-token-value"})
    assert ok.status_code == 200


# --- resource_key_for / process_event -------------------------------------------


@pytest.mark.parametrize(
    "event_type,key",
    [
        ("payment.created", "payment"),
        ("refund.refunded", "refund"),
        ("capture.paid", "capture"),
        ("dispute.created", "dispute"),
        ("paymentlink.created", "paymentLink"),
        ("paymentlink.payment.rejected", "paymentLink"),
        ("unknownobject.created", None),
    ],
)
def test_resource_key_for(event_type, key):
    assert resource_key_for(event_type) == key


def test_process_event_reads_payment_link_for_three_segment_type():
    summary = process_event(
        {"apiVersion": "v1", "id": "e1", "type": "paymentlink.payment.rejected", "paymentLink": {"id": "pl_1"}}
    )
    assert summary["resourceId"] == "pl_1"


def test_process_event_token_deleted_with_only_id():
    summary = process_event({"apiVersion": "v1", "id": "e2", "type": "token.deleted", "token": {"id": "tok_1"}})
    assert summary["resourceId"] == "tok_1"


def test_process_event_extracts_merchant_reference():
    event = make_event()
    event["payment"]["paymentOutput"]["references"]["merchantReference"] = "order-42"
    assert process_event(event)["merchantReference"] == "order-42"
