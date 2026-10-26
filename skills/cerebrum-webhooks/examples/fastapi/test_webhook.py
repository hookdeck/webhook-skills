import base64
import hashlib
import hmac
import itertools
import json
import time

import pytest
from fastapi.testclient import TestClient

from main import app, get_signature_headers, processed_message_ids, verify_cerebrum_webhook

# Svix-style secret: 'whsec_' + base64 of the key ("test_secret_key").
SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5"
KEY = base64.b64decode(SECRET[len("whsec_"):])

EVENTS = [
    "ORDER_STATUS_CHANGE",
    "ORDER_SCORE_CHANGE",
    "ORDER_CUSTOM_SCORE_CHANGE",
    "ORDER_DISPUTE_RESOLVED",
    "VOUCHER_STARTED",
    "VOUCHER_REDEEMED",
    "VOUCHER_EXPIRED",
    "MONITORING_REPORT_GENERATED",
    "BEAM_INPUT_CREATED",
]

client = TestClient(app)
_counter = itertools.count()


@pytest.fixture(autouse=True)
def configured_secret(monkeypatch):
    monkeypatch.setenv("CEREBRUM_WEBHOOK_SECRET", SECRET)
    processed_message_ids.clear()


def payload_for(event: str, **extra) -> bytes:
    """Payload shape from Cerebrum's JSON Schema; the values are made up for tests."""
    body = {
        "id": "ord_test_123",
        "idType": "ORDER",
        "additionalMetadata": {},
        "event": event,
        "eventDate": "2026-10-26T12:00:00.000Z",
        "svixAppId": "app_test",
        "metadata": {},
        **extra,
    }
    return json.dumps(body).encode()


def sign(msg_id: str, timestamp: int, body: bytes, key: bytes = KEY) -> str:
    """Same algorithm as Svix: base64(HMAC-SHA256(key, f"{id}.{timestamp}.{body}"))."""
    signed = f"{msg_id}.{timestamp}.".encode() + body
    return "v1," + base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()


def post(body: bytes, prefix="svix", msg_id=None, timestamp=None, signature=None, content_type="application/json"):
    msg_id = msg_id or f"msg_test_{int(time.time())}_{next(_counter)}"
    timestamp = int(time.time()) if timestamp is None else timestamp
    headers = {
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": str(timestamp),
        f"{prefix}-signature": signature or sign(msg_id, timestamp, body),
        "content-type": content_type,
    }
    return client.post("/webhooks/cerebrum", content=body, headers=headers)


class TestCerebrumWebhook:
    def test_accepts_valid_delivery_with_svix_headers(self):
        res = post(payload_for("ORDER_STATUS_CHANGE"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_same_delivery_with_webhook_headers(self):
        res = post(payload_for("ORDER_SCORE_CHANGE"), prefix="webhook")
        assert res.status_code == 200

    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_each_documented_event(self, event):
        assert post(payload_for(event)).status_code == 200

    def test_acknowledges_unknown_event(self):
        assert post(payload_for("SOMETHING_NEW")).status_code == 200

    def test_handles_order_update_with_metadata_delta(self):
        body = payload_for(
            "ORDER_STATUS_CHANGE",
            metadata={"delta": [{"op": "replace", "path": "/status", "value": "COMPLETE"}]},
        )
        assert post(body).status_code == 200

    def test_verifies_any_content_type(self):
        assert post(payload_for("VOUCHER_REDEEMED"), content_type="text/plain").status_code == 200

    def test_accepts_when_one_of_several_signatures_is_valid(self):
        body = payload_for("VOUCHER_STARTED")
        ts = int(time.time())
        stale = sign("msg_multi", ts, body, key=b"old_key")
        good = sign("msg_multi", ts, body)
        assert post(body, msg_id="msg_multi", timestamp=ts, signature=f"{stale} {good}").status_code == 200

    def test_ignores_signature_versions_other_than_v1(self):
        body = payload_for("VOUCHER_STARTED")
        ts = int(time.time())
        v1a = sign("msg_v1a", ts, body).replace("v1,", "v1a,", 1)
        assert post(body, msg_id="msg_v1a", timestamp=ts, signature=v1a).status_code == 400

    def test_rejects_tampered_body(self):
        body = payload_for("ORDER_STATUS_CHANGE")
        ts = int(time.time())
        res = post(payload_for("ORDER_SCORE_CHANGE"), msg_id="msg_t", timestamp=ts, signature=sign("msg_t", ts, body))
        assert res.status_code == 400

    def test_rejects_wrong_key(self):
        body = payload_for("ORDER_STATUS_CHANGE")
        ts = int(time.time())
        res = post(body, msg_id="msg_k", timestamp=ts, signature=sign("msg_k", ts, body, key=b"some_other_key"))
        assert res.status_code == 400

    def test_rejects_timestamp_older_than_five_minutes(self):
        assert post(payload_for("ORDER_STATUS_CHANGE"), timestamp=int(time.time()) - 6 * 60).status_code == 400

    def test_rejects_missing_signature_headers(self):
        res = client.post(
            "/webhooks/cerebrum", content=payload_for("ORDER_STATUS_CHANGE"), headers={"content-type": "application/json"}
        )
        assert res.status_code == 400

    def test_rejects_signed_body_that_is_not_json(self):
        assert post(b"not json").status_code == 400

    def test_acknowledges_repeated_message_id_without_reprocessing(self):
        body = payload_for("ORDER_STATUS_CHANGE")
        ts = int(time.time())
        assert post(body, msg_id="msg_dup", timestamp=ts).status_code == 200
        again = post(body, msg_id="msg_dup", timestamp=ts)
        assert again.status_code == 200
        assert again.json()["duplicate"] is True

    def test_fails_closed_without_secret(self, monkeypatch):
        monkeypatch.delenv("CEREBRUM_WEBHOOK_SECRET")
        assert post(payload_for("ORDER_STATUS_CHANGE")).status_code == 500


class TestGetSignatureHeaders:
    def test_prefers_svix_when_svix_id_present(self):
        got = get_signature_headers(
            {"svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x", "webhook-id": "b"}
        )
        assert got["svix-id"] == "a"

    def test_falls_back_to_webhook_headers(self):
        got = get_signature_headers({"webhook-id": "b", "webhook-timestamp": "2", "webhook-signature": "v1,y"})
        assert got == {"svix-id": "b", "svix-timestamp": "2", "svix-signature": "v1,y"}

    def test_none_when_chosen_set_is_incomplete(self):
        assert get_signature_headers({"svix-id": "a", "webhook-timestamp": "2"}) is None


def test_verify_returns_parsed_payload():
    body = payload_for("BEAM_INPUT_CREATED")
    ts = int(time.time())
    headers = {"svix-id": "msg_v", "svix-timestamp": str(ts), "svix-signature": sign("msg_v", ts, body)}
    assert verify_cerebrum_webhook(body, headers, SECRET)["event"] == "BEAM_INPUT_CREATED"
