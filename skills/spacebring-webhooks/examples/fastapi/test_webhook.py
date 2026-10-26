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

# Bodies: `type` beside one resource object; subscription.* is a bare object; visitors.* carries `visit` only
BOOKING = {"booking": {"id": "bkg_01"}}
EVENTS = {
    "benefit.application.created": {"application": {"id": "app_01"}},
    "booking.created": BOOKING,
    "booking.deleted": BOOKING,
    "booking.paid": BOOKING,
    "booking.updated": BOOKING,
    "company.created": {"company": {"id": "co_01"}},
    "company.deleted": {"company": {"id": "co_01"}},
    "event.canceled": {"event": {"id": "evt_01"}},
    "event.created": {"event": {"id": "evt_01"}},
    "event.deleted": {"event": {"id": "evt_01"}},
    "event.ticket.created": {"ticket": {"id": "tkt_01"}},
    "event.ticket.paid": {"ticket": {"id": "tkt_01"}},
    "event.updated": {"event": {"id": "evt_01"}},
    "invoice.issued": {"invoice": {"id": "inv_01"}},
    "location.created": {"location": {"id": "loc_01"}},
    "location.deleted": {"location": {"id": "loc_01"}},
    "location.updated": {"location": {"id": "loc_01"}},
    "membership.created": {"membership": {"id": "mem_01"}},
    "membership.invited": {"membership": {"id": "mem_01"}},
    "resource.created": {"resource": {"id": "res_01"}},
    "resource.deleted": {"resource": {"id": "res_01"}},
    "resource.updated": {"resource": {"id": "res_01"}},
    "shop.order.created": {"order": {"id": "ord_01"}},
    "shop.order.paid": {"order": {"id": "ord_01"}},
    "subscription.created": {"id": "sub_01"},
    "subscription.deleted": {"id": "sub_01"},
    "subscription.purchased": {"id": "sub_01"},
    "subscription.updated": {"id": "sub_01"},
    "support.ticket.created": {"ticket": {"id": "sup_01"}},
    "visitors.request.approved": {"visit": {"id": "vis_01"}},
    "visitors.visit.checked_in": {"visit": {"id": "vis_01"}},
    "visitors.visit.checked_out": {"visit": {"id": "vis_01"}},
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
    """prefix is 'svix' (Spacebring) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/spacebring",
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
    monkeypatch.setenv("SPACEBRING_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,data", list(EVENTS.items()))
def test_handles_events(event_type, data):
    response = send(json.dumps({"type": event_type, **data}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"type": "spacebring.something.new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "spacebring.something.new"


def test_body_without_type_field():
    """subscription.* and visitors.* bodies may carry no `type`."""
    response = send(json.dumps({"id": "sub_01", "status": "active"}))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": None}


def test_any_content_type_verifies():
    response = send(json.dumps({"type": "booking.paid", "booking": {"id": "bkg_01"}}), content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(json.dumps({"type": "booking.paid", "booking": {"id": "bkg_01"}}), prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "booking.paid"}


def test_webhook_prefixed_invalid_signature():
    response = send('{"type":"booking.paid"}', prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"type": "invoice.issued"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/spacebring", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"type":"invoice.issued"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"type":"invoice.issued"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"type":"invoice.issued"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"type":"booking.deleted"}', msg_id, timestamp)
    response = send('{"type":"booking.paid"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"type":"invoice.issued"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("SPACEBRING_WEBHOOK_SECRET")
    assert send('{"type":"invoice.issued"}').status_code == 500
