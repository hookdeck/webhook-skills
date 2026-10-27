import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

VENUE = {"id": 1234, "name": "My Restaurant", "slug": "my-restaurant"}
ORDER = {
    "id": "ord_abc123", "code": "A1B2", "total": 2500, "orderType": "Pickup",
    "items": [{"name": "Margherita Pizza", "price": 1200, "quantity": 1}], "venue": VENUE,
}


def envelope(event_type: str, data: dict = None) -> str:
    """Standard {event, data} envelope."""
    return json.dumps({"event": event_type, "data": data or {}})


def refund_envelope(event_type: str) -> str:
    """order.refund.* put order/customer/venue/refund beside `event`."""
    return json.dumps({
        "event": event_type,
        "order": {"id": "ord_abc123", "total": 2500},
        "customer": {"id": None, "name": "John Doe", "email": "john@example.com"},
        "venue": VENUE,
        "refund": {"status": "pending", "amount": 1000, "totalAmountRefunded": 1000, "reason": None},
    })


def status_data(status: str) -> dict:
    return {"order": {"id": "ord_abc123", "code": "A1B2", "status": status}, "venue": VENUE}


LINK = {"paymentLink": {"id": "plink_019dbc4d", "title": "Invoice #001", "reference": "INV-001"}, "venue": VENUE}
LINK_REFUND = {"refund": {"id": "ref_xyz789", "transactionId": "txn_abc123", "amount": 1000, "currency": "GBP"}}
PRINTER = {"printer": {"id": "6041b7c2", "name": "Kitchen Printer"}, "venue": VENUE}

# All 27 documented events, each with a payload shaped like the docs
EVENTS = {
    "order.created.v2": envelope("order.created.v2", ORDER),
    "order.created": json.dumps(ORDER),  # legacy: bare order object, no `event`
    "order.accepted": envelope("order.accepted", {**ORDER, "status": "accepted", "acceptedAt": "2024-01-15T10:31:00Z"}),
    "order.rejected": envelope("order.rejected", {**ORDER, "status": "rejected", "rejectedAt": "2024-01-15T10:31:00Z"}),
    "order.canceled": envelope("order.canceled", status_data("canceled")),
    "order.preparing": envelope("order.preparing", status_data("preparing")),
    "order.ready_for_pickup": envelope("order.ready_for_pickup", status_data("ready_for_pickup")),
    "order.out_for_delivery": envelope("order.out_for_delivery", status_data("out_for_delivery")),
    "order.pos.dispatch.failed": envelope("order.pos.dispatch.failed", {
        "order": {"id": "ord_abc123", "code": "A1B2", "total": 2500}, "venue": VENUE,
        "pos": {"name": "Zonal", "error": "Connection timeout"}, "retryCount": 3}),
    "order.rating.updated": envelope("order.rating.updated", {
        "order": {"id": "ord_abc123", "code": "A1B2"}, "rating": 5, "comments": "Great food", "venue": VENUE}),
    "order.completed": envelope("order.completed", status_data("completed")),
    "order.refund.created": refund_envelope("order.refund.created"),
    "order.refund.succeeded": refund_envelope("order.refund.succeeded"),
    "order.refund.failed": refund_envelope("order.refund.failed"),
    "store.opened": envelope("store.opened", {"venue": VENUE}),
    "store.closed": envelope("store.closed", {"closedReason": "", "closedUntil": "", "venue": VENUE}),
    "store.opening_hours.updated": envelope("store.opening_hours.updated", {
        "venue": VENUE, "openingHours": [{"day": "monday", "openTime": "09:00:00", "closeTime": "22:00:00", "active": True}],
        "specialHours": [], "source": "dashboard"}),
    "item.out_of_stock": envelope("item.out_of_stock", {
        "venue": VENUE, "item": {"id": 5678, "name": "Margherita Pizza"}, "reason": "snoozed",
        "source": "manual", "details": {"snoozeEnd": None}}),
    "payments.payout.created": envelope("payments.payout.created", {
        "amounts": [{"currency": "GBP", "value": "3210.50"}], "estimatedArrivalDate": "1/2024"}),
    "bill.payment.created": envelope("bill.payment.created", {}),
    "payment_link.created": envelope("payment_link.created", {
        "paymentLink": {"id": "plink_019dbc4d", "type": "one_off", "amountType": "fixed", "amount": 2500, "currency": "GBP"},
        "venue": VENUE}),
    "payment_link.paid": envelope("payment_link.paid", {
        **LINK, "payment": {"transactionId": "txn_abc123", "amount": 2500, "currency": "GBP", "pspReference": "ABCD1234"}}),
    "payment_link.refund.created": envelope("payment_link.refund.created", {**LINK, **LINK_REFUND}),
    "payment_link.refund.succeeded": envelope("payment_link.refund.succeeded", {**LINK, **LINK_REFUND}),
    "payment_link.refund.failed": envelope("payment_link.refund.failed", {**LINK, **LINK_REFUND}),
    "printer.status.offline": envelope("printer.status.offline", PRINTER),
    "printer.status.online": envelope("printer.status.online", PRINTER),
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Storekit as documented) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/storekit",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("STOREKIT_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_documented_event_count():
    assert len(EVENTS) == 27


@pytest.mark.parametrize("event_type", list(EVENTS))
def test_handles_events(event_type):
    response = send(EVENTS[event_type])
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(envelope("storekit.something.new"))
    assert response.status_code == 200
    assert response.json()["type"] == "storekit.something.new"


def test_any_content_type_verifies():
    response = send(EVENTS["store.opened"], content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(EVENTS["order.created.v2"], prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "order.created.v2"}


def test_webhook_prefixed_invalid_signature():
    response = send(EVENTS["order.created.v2"], prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = EVENTS["order.completed"]
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_other_signature_versions_ignored():
    payload = EVENTS["order.completed"]
    msg_id, timestamp = "msg_v1a", now()
    signature = sign(payload, msg_id, timestamp).replace("v1,", "v1a,", 1)
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_missing_headers():
    response = client.post("/webhooks/storekit", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(EVENTS["order.created.v2"], signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(EVENTS["order.created.v2"], signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = EVENTS["order.created.v2"]
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(EVENTS["order.canceled"], msg_id, timestamp)
    response = send(EVENTS["order.completed"], msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(EVENTS["order.created.v2"], timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_non_object_body_rejected():
    response = send("[1,2,3]")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("STOREKIT_WEBHOOK_SECRET")
    assert send(EVENTS["order.created.v2"]).status_code == 500
