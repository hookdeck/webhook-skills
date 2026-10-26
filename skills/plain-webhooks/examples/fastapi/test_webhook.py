import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PLAIN_WEBHOOK_SECRET"] = "test_plain_hmac_secret"

from main import app

client = TestClient(app)

SECRET = os.environ["PLAIN_WEBHOOK_SECRET"]


def sign(payload: bytes, secret: str = SECRET) -> str:
    """hex(HMAC-SHA256(secret, rawBody)) - what Plain sends in Plain-Request-Signature."""
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def make_event(event_type: str, extra: dict = None, attempt_ts: str = None) -> bytes:
    if attempt_ts is None:
        attempt_ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return json.dumps(
        {
            "id": "e_01HD44FHMCDSSWE38N14FSYV6K",
            "type": event_type,
            "timestamp": "2023-10-19T14:12:25.266Z",
            "workspaceId": "w_01GST0W989ZNAW53X6XYHAY87P",
            "payload": {"eventType": event_type, **(extra or {})},
            "webhookMetadata": {
                "webhookTargetId": "wt_01",
                "webhookTargetVersion": "2023-10-15",
                "webhookDeliveryAttemptId": "wda_01",
                "webhookDeliveryAttemptNumber": 1,
                "webhookDeliveryAttemptTimestamp": attempt_ts,
            },
        }
    ).encode("utf-8")


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Plain-Request-Signature"] = signature
    return client.post("/webhooks/plain", content=body, headers=headers)


@pytest.mark.parametrize(
    "event_type,extra",
    [
        ("thread.thread_created", {"thread": {"id": "th_01"}}),
        ("thread.email_received", {"email": {"id": "em_01"}}),
        ("thread.thread_status_transitioned", {"thread": {"id": "th_01"}}),
        ("customer.customer_created", {"customer": {"id": "c_01"}}),
        ("thread.note_created", {"note": {"id": "n_01"}}),
    ],
)
def test_accepts_valid_signed_event(event_type, extra):
    body = make_event(event_type, extra)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_verifies_raw_body_for_any_content_type():
    body = make_event("thread.thread_created")
    assert post(body, sign(body), "text/plain").status_code == 200


def test_accepts_uppercase_hex_signature():
    body = make_event("thread.thread_created")
    assert post(body, sign(body).upper()).status_code == 200


def test_missing_signature_returns_400():
    assert post(make_event("thread.thread_created")).status_code == 400


def test_wrong_signature_returns_401():
    assert post(make_event("thread.thread_created"), "a" * 64).status_code == 401


def test_wrong_secret_returns_401():
    body = make_event("thread.thread_created")
    assert post(body, sign(body, "other_secret")).status_code == 401


def test_modified_body_returns_401():
    body = make_event("thread.thread_created")
    assert post(body + b" ", sign(body)).status_code == 401


def test_wrong_length_signature_returns_401():
    body = make_event("thread.thread_created")
    assert post(body, sign(body)[:62]).status_code == 401


def test_non_hex_signature_returns_401():
    body = make_event("thread.thread_created")
    assert post(body, "zz" + sign(body)[2:]).status_code == 401


def test_trailing_suffix_returns_401():
    body = make_event("thread.thread_created")
    assert post(body, sign(body) + "zz").status_code == 401


def test_non_ascii_signature_returns_401_not_500():
    body = make_event("thread.thread_created")
    # Send the raw UTF-8 bytes of a non-ASCII header value (httpx rejects non-ASCII str headers).
    res = client.post(
        "/webhooks/plain",
        content=body,
        headers={"Content-Type": "application/json", "Plain-Request-Signature": ("é" * 64).encode("utf-8")},
    )
    assert res.status_code == 401


def test_non_json_body_returns_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400


def test_stale_timestamp_ignored_by_default(monkeypatch):
    monkeypatch.delenv("PLAIN_TOLERANCE_SECONDS", raising=False)
    body = make_event("thread.thread_created", attempt_ts="2020-01-01T00:00:00.000Z")
    assert post(body, sign(body)).status_code == 200


def test_stale_timestamp_rejected_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("PLAIN_TOLERANCE_SECONDS", "300")
    body = make_event("thread.thread_created", attempt_ts="2020-01-01T00:00:00.000Z")
    assert post(body, sign(body)).status_code == 400


def test_fresh_timestamp_accepted_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("PLAIN_TOLERANCE_SECONDS", "300")
    body = make_event("thread.thread_created")
    assert post(body, sign(body)).status_code == 200
