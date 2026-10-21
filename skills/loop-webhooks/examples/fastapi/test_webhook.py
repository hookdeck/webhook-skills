import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-format secret: 'whsec_' + base64 key. This is the example secret from
# Loop's docs (https://docs.loop.com/developers/webhooks).
TEST_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"

EVENT_TYPES = [
    "artifact.root-ingestion-completed",
    "business-exception.created",
    "business-exception.deleted",
    "business-exception.reopened",
    "business-exception.resolved",
    "payable-invoice-review.completed",
    "payable-invoice.shipment-job-linked",
    "payable-invoice.shipment-job-unlinked",
    "payment.completed",
    "payment.failed",
    "payment.initiated",
    "quick-pay-relationship.revised",
    "receivable-invoice.created",
    "receivable-invoice.finalized",
    "receivable-invoice.voided",
    "shipment-job-artifact.assessed",
    "shipment-job-artifact.assigned",
    "shipment-job-artifact.unassessed",
    "shipment-job-artifact.unassigned",
    "shipment-job.normalized",
    "shipment-job.rerated",
    "test-event.created",
]

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("LOOP_WEBHOOK_SECRET", TEST_SECRET)


def sign(body: str, timestamp: str, msg_id: str, secret: str = TEST_SECRET) -> str:
    """Same algorithm Loop (via Svix) uses:
    base64(HMAC-SHA256(base64decode(secret minus whsec_), f"{id}.{timestamp}.{body}"))"""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def make_event(event_type: str, **fields) -> dict:
    return {
        "eventCreatedAt": datetime.now(timezone.utc).isoformat(),
        "eventId": secrets.token_urlsafe(32),
        "eventType": event_type,
        **fields,
    }


def send(body: str, msg_id: str | None = None, timestamp: str | None = None, signature: str | None = None):
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    ts = timestamp or str(int(time.time()))
    return client.post(
        "/webhooks/loop",
        content=body,
        headers={
            "content-type": "application/json",
            "svix-id": msg_id,
            "svix-timestamp": ts,
            "svix-signature": signature or f"v1,{sign(body, ts, msg_id)}",
        },
    )


def test_signing_helper_matches_docs_example():
    assert (
        sign('{"test": 2432232314}', "1614265330", "msg_p5jXN8AQM9LWM0D4loKWxJek")
        == "g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="
    )


def test_valid_test_event():
    body = json.dumps(make_event("test-event.created", optionalString="hello"))
    response = send(body)
    assert response.status_code == 200
    assert response.json() == {"received": True, "eventType": "test-event.created"}


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_handles_every_event_type(event_type):
    response = send(json.dumps(make_event(event_type)))
    assert response.status_code == 200
    assert response.json()["eventType"] == event_type


def test_multiple_signatures_rotation():
    body = json.dumps(make_event("payment.completed"))
    ts = str(int(time.time()))
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= v1,{sign(body, ts, 'msg_rotation')}"
    response = send(body, msg_id="msg_rotation", timestamp=ts, signature=signature)
    assert response.status_code == 200


def test_missing_headers():
    response = client.post(
        "/webhooks/loop",
        content=json.dumps(make_event("payment.completed")),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(json.dumps(make_event("payment.completed")), signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    body = json.dumps(make_event("payment.completed"))
    ts = str(int(time.time()))
    other = "whsec_" + base64.b64encode(secrets.token_bytes(24)).decode()
    response = send(body, msg_id="msg_x", timestamp=ts, signature=f"v1,{sign(body, ts, 'msg_x', other)}")
    assert response.status_code == 400


def test_tampered_body():
    body = json.dumps(make_event("payment.completed"))
    ts = str(int(time.time()))
    signature = f"v1,{sign(body, ts, 'msg_y')}"
    tampered = body.replace("payment.completed", "payment.failed")
    response = send(tampered, msg_id="msg_y", timestamp=ts, signature=signature)
    assert response.status_code == 400


def test_old_timestamp():
    body = json.dumps(make_event("payment.completed"))
    ts = str(int(time.time()) - 600)
    response = send(body, msg_id="msg_old", timestamp=ts, signature=f"v1,{sign(body, ts, 'msg_old')}")
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp outside tolerance"


def test_dedupes_on_event_id_not_svix_id():
    body = json.dumps(make_event("receivable-invoice.finalized"))
    first = send(body, msg_id="msg_first")
    second = send(body, msg_id="msg_resend")
    assert first.status_code == 200
    assert "duplicate" not in first.json()
    assert second.status_code == 200
    assert second.json()["duplicate"] is True


def test_unknown_event_type():
    response = send(json.dumps(make_event("something.new")))
    assert response.status_code == 200
    assert response.json()["eventType"] == "something.new"


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
