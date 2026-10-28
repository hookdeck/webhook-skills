# Generated with: whatnot-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Whatnot FastAPI webhook receiver.

Signatures are generated exactly the way Whatnot does (Standard Webhooks:
base64 HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{body}"), and the
golden vector from Whatnot's webhooks guide is checked byte for byte.
Topic payloads are ILLUSTRATIVE: field names and shapes follow Whatnot's
webhooks OpenAPI description; the values are made up.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

import pytest
import standardwebhooks.webhooks as standardwebhooks_module
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

# The golden vector Whatnot publishes in its webhooks guide: a real signed
# delivery and the secret that signed it. The body is the EXACT bytes Whatnot
# sent (note the spaces after ':' and ','); re-serialising it breaks the HMAC.
GOLDEN_SECRET = "wn_wh_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA="
GOLDEN_ID = "0b7e4f6c-3d1a-4a8e-9f2b-5c6d7e8f9a0b"
GOLDEN_TIMESTAMP = "1792512005"
GOLDEN_SIGNATURE = "v1,8m/VX9GLLqhNZJndMpPw7OTUKSDI4szDXAmIFY8ffBI="
GOLDEN_BODY = (
    b'{"type": "shows.started", "timestamp": "2026-10-20T16:00:00.123Z", '
    b'"data": {"show_id": "9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c"}, "version": "v2", "seller_id": "1234567"}'
)
GOLDEN_HEADERS = {
    "webhook-id": GOLDEN_ID,
    "webhook-timestamp": GOLDEN_TIMESTAMP,
    "webhook-signature": GOLDEN_SIGNATURE,
}
SECRET = GOLDEN_SECRET

os.environ["WHATNOT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, processed_webhook_ids, verify_whatnot_webhook  # noqa: E402

client = TestClient(app)


def sign(raw_body: bytes, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Whatnot: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret.removeprefix("wn_wh_"))
    digest = hmac.digest(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256)
    return "v1," + base64.b64encode(digest).decode()


def whatnot_verify(raw_body, headers, webhook_secret) -> bool:
    """Whatnot's own no-library sample, verbatim from its webhooks guide."""
    key = base64.b64decode(webhook_secret.removeprefix("wn_wh_"))
    msg_id = headers["webhook-id"]
    timestamp = headers["webhook-timestamp"]
    if abs(time.time() - int(timestamp)) > 5 * 60:
        return False
    signed_content = f"{msg_id}.{timestamp}.".encode() + raw_body
    digest = hmac.digest(key, signed_content, hashlib.sha256)
    expected = base64.b64encode(digest).decode()
    for entry in headers["webhook-signature"].split(" "):
        version, _, signature = entry.partition(",")
        if version == "v1" and hmac.compare_digest(signature, expected):
            return True
    return False


def now() -> int:
    return int(time.time())


def signed_headers(raw_body: bytes, msg_id=None, timestamp=None, secret=SECRET) -> dict:
    msg_id = msg_id or str(uuid.uuid4())
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: bytes, headers: dict):
    return client.post("/webhooks/whatnot", content=raw_body, headers=headers)


def money(amount: str) -> dict:
    return {"amount": amount, "currency": "USD"}


def body(event_type: str, data: dict) -> bytes:
    # Whatnot sends space-separated JSON, which is Python's json.dumps default.
    return json.dumps(
        {"type": event_type, "timestamp": "2026-10-20T16:00:00.123Z", "data": data, "version": "v2", "seller_id": "1234567"}
    ).encode()


ORDER = {
    "id": "ord_example_1",
    "status": "pending_fulfillment",
    "show_id": "9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c",
    "transaction_type": "auction",
    "buyer": {"id": "usr_example_1", "username": "cardcollector", "display_name": None},
    "amounts": {
        "subtotal": money("40.00"),
        "shipping": money("5.00"),
        "tax": money("4.77"),
        "applied_discount": None,
        "total": money("49.77"),
    },
    "created_at": "2026-10-20T16:05:00.000Z",
    "updated_at": "2026-10-20T16:05:00.000Z",
    "cancelled_at": None,
}

TRACKING = {"carrier": "usps", "service": "usps_ground_advantage", "tracking_code": "9400100000000000000000", "last_mile_tracking_code": None}

DATA = {
    "orders.created": ORDER,
    "orders.updated": {**ORDER, "status": "cancelled", "buyer": None, "cancelled_at": "2026-10-20T17:00:00.000Z"},
    "shows.created": {"id": "show_example_1", "title": "Friday card breaks", "status": "scheduled"},
    "shows.updated": {"id": "show_example_1", "title": "Friday card breaks", "status": "scheduled"},
    "shows.started": {"show_id": "show_example_1"},
    "shows.ended": {"show_id": "show_example_1"},
    "shows.cancelled": {"show_id": "show_example_1"},
    "merchandising.products.added_to_show": {"product_id": "prd_example_1", "show_id": "show_example_1"},
    "merchandising.products.removed_from_show": {"product_id": "prd_example_1", "show_id": "show_example_1"},
    "shipments.created": {"id": "shp_example_1", "status": "created", "recipient": None, "documents": None},
    "shipments.label_generated": {"shipment_id": "shp_example_1", "reason": "generated", "tracking": TRACKING, "documents": None},
    "shipments.tracking_code_added": {"shipment_id": "shp_example_1", "tracking": TRACKING},
    "shipments.parcel_updated": {"shipment_id": "shp_example_1", "weight": {"value": 8, "unit": "ounce"}},
    "shipments.items.added": {"shipment_id": "shp_example_1", "shipment_item_ids": ["itm_1", "itm_2"]},
    "shipments.items.removed": {"shipment_id": "shp_example_1", "shipment_item_ids": ["itm_1"]},
    "products.created": {"id": "prd_example_1", "title": "Holo rare"},
    "products.updated": {"id": "prd_example_1", "title": "Holo rare (PSA 10)"},
    "products.deleted": {"id": "prd_example_1"},
}


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv("WHATNOT_WEBHOOK_SECRET", SECRET)
    processed_webhook_ids.clear()


def freeze_clock(monkeypatch, unix_seconds: int) -> None:
    """Freeze the clock the library and Whatnot's sample read."""

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromtimestamp(unix_seconds, tz or timezone.utc)

    monkeypatch.setattr(standardwebhooks_module, "datetime", FrozenDatetime)
    monkeypatch.setattr(time, "time", lambda: float(unix_seconds))


class TestGoldenVector:
    @pytest.fixture(autouse=True)
    def frozen(self, monkeypatch):
        freeze_clock(monkeypatch, int(GOLDEN_TIMESTAMP))

    def test_our_signer_reproduces_the_published_signature(self):
        assert sign(GOLDEN_BODY, GOLDEN_ID, GOLDEN_TIMESTAMP) == GOLDEN_SIGNATURE

    def test_whatnots_own_sample_accepts_it(self):
        assert whatnot_verify(GOLDEN_BODY, GOLDEN_HEADERS, GOLDEN_SECRET) is True

    def test_verify_whatnot_webhook_accepts_it(self):
        event = verify_whatnot_webhook(GOLDEN_BODY, GOLDEN_HEADERS, GOLDEN_SECRET)
        assert event["type"] == "shows.started"
        assert event["seller_id"] == "1234567"

    def test_endpoint_accepts_it(self, caplog):
        with caplog.at_level(logging.INFO, logger="whatnot-webhooks"):
            res = post(GOLDEN_BODY, {**GOLDEN_HEADERS, "content-type": "application/json"})
        assert res.status_code == 200
        assert "shows.started: show 9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c" in caplog.text

    def test_fails_if_wn_wh_prefix_not_stripped(self):
        # The library only strips "whsec_"; with "wn_wh_" left on it silently
        # decodes to the wrong key (no error), so every check just fails.
        with pytest.raises(WebhookVerificationError):
            Webhook(GOLDEN_SECRET).verify(GOLDEN_BODY, GOLDEN_HEADERS)

    def test_fails_on_reserialised_compact_json(self):
        compact = json.dumps(json.loads(GOLDEN_BODY), separators=(",", ":")).encode()
        with pytest.raises(WebhookVerificationError):
            verify_whatnot_webhook(compact, GOLDEN_HEADERS, GOLDEN_SECRET)

    def test_accepts_space_separated_list_with_one_valid_entry(self):
        rotated = f"v1,{base64.b64encode(bytes(32)).decode()} {GOLDEN_SIGNATURE}"
        res = post(GOLDEN_BODY, {**GOLDEN_HEADERS, "webhook-signature": rotated})
        assert res.status_code == 200

    def test_rejects_vector_past_the_5_minute_tolerance(self, monkeypatch):
        freeze_clock(monkeypatch, int(GOLDEN_TIMESTAMP) + 301)
        assert whatnot_verify(GOLDEN_BODY, GOLDEN_HEADERS, GOLDEN_SECRET) is False
        assert post(GOLDEN_BODY, GOLDEN_HEADERS).status_code == 400


class TestEndpoint:
    @pytest.mark.parametrize("event_type", list(DATA))
    def test_accepts_signed_event(self, event_type):
        raw = body(event_type, DATA[event_type])
        res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_logs_seller_id_from_signed_body(self, caplog):
        raw = body("orders.created", ORDER)
        with caplog.at_level(logging.INFO, logger="whatnot-webhooks"):
            post(raw, signed_headers(raw))
        assert "(seller 1234567)" in caplog.text

    def test_handles_order_without_read_customers(self):
        raw = body("orders.created", {**ORDER, "buyer": None})
        assert post(raw, signed_headers(raw)).status_code == 200

    def test_acknowledges_unknown_type(self, caplog):
        raw = body("something.new", {"foo": "bar"})
        with caplog.at_level(logging.INFO, logger="whatnot-webhooks"):
            res = post(raw, signed_headers(raw))
        assert res.status_code == 200
        assert "Unhandled Whatnot event type: something.new" in caplog.text

    def test_dedupes_retry_on_webhook_id(self):
        raw = body("orders.created", ORDER)
        msg_id = str(uuid.uuid4())
        assert post(raw, signed_headers(raw, msg_id=msg_id)).json() == {"received": True}
        # A retry is re-signed with a fresh timestamp but keeps the same webhook-id.
        retry = signed_headers(raw, msg_id=msg_id, timestamp=now() + 30)
        assert post(raw, retry).json() == {"received": True, "duplicate": True}

    @pytest.mark.parametrize("name", ["webhook-id", "webhook-timestamp", "webhook-signature"])
    def test_returns_400_when_header_missing(self, name):
        raw = body("orders.created", ORDER)
        headers = signed_headers(raw)
        del headers[name]
        assert post(raw, headers).status_code == 400

    def test_returns_400_for_legacy_hex_scheme(self):
        raw = body("orders.created", ORDER)
        hex_sig = hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
        assert post(raw, {"X-Whatnot-Webhook-Signature": hex_sig}).status_code == 400

    def test_returns_400_for_stale_timestamp(self):
        raw = body("orders.created", ORDER)
        res = post(raw, signed_headers(raw, timestamp=now() - 6 * 60))
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_returns_400_for_malformed_signature_entry(self):
        raw = body("orders.created", ORDER)
        headers = {**signed_headers(raw), "webhook-signature": "not-a-signature"}
        assert post(raw, headers).status_code == 400

    def test_returns_400_for_another_secret(self):
        raw = body("orders.created", ORDER)
        other = "wn_wh_" + base64.b64encode(bytes([7] * 32)).decode()
        assert post(raw, signed_headers(raw, secret=other)).status_code == 400

    def test_returns_400_for_tampered_body(self):
        raw = body("orders.created", ORDER)
        headers = signed_headers(raw)
        assert post(raw.replace(b"49.77", b"0.01"), headers).status_code == 400

    def test_works_when_secret_configured_without_prefix(self, monkeypatch):
        monkeypatch.setenv("WHATNOT_WEBHOOK_SECRET", SECRET.removeprefix("wn_wh_"))
        raw = body("orders.created", ORDER)
        assert post(raw, signed_headers(raw)).status_code == 200

    def test_returns_500_when_secret_not_set(self, monkeypatch):
        monkeypatch.delenv("WHATNOT_WEBHOOK_SECRET")
        raw = body("orders.created", ORDER)
        assert post(raw, signed_headers(raw)).status_code == 500
