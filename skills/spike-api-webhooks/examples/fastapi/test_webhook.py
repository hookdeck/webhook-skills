import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_spike_api_secret"
os.environ["SPIKE_API_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

# Payloads as shown in the Spike API docs
RECORD_CHANGE = json.dumps([
    {
        "application_user_id": "User1",
        "timestamp": "2025-04-15T13:33:55.271331177Z",
        "event_type": "record_change",
        "metrics": ["calories_burned_active", "distance", "steps"],
        "activity_types": ["sedentary", "walking"],
        "provider_slug": "garmin",
        "earliest_record_start_at": "2025-04-15T09:30:00Z",
        "latest_record_end_at": "2025-04-15T13:33:00Z",
    },
    {
        "application_user_id": "User2",
        "timestamp": "2025-04-15T13:33:55.271331177Z",
        "event_type": "record_change",
        "metrics": ["calories_burned_active"],
        "activity_types": ["walking"],
        "provider_slug": "garmin",
        "earliest_record_start_at": "2025-04-15T09:30:00Z",
        "latest_record_end_at": "2025-04-15T13:33:00Z",
    },
]).encode()
INTEGRATION_CREATED = json.dumps([
    {
        "application_user_id": "test",
        "timestamp": "2025-08-29T13:21:10.703300387Z",
        "event_type": "provider_integration_created",
        "provider_slug": "oura",
    }
]).encode()
INTEGRATION_DELETED = json.dumps([
    {
        "application_user_id": "test",
        "timestamp": "2025-08-29T13:21:10.703300387Z",
        "event_type": "provider_integration_deleted",
        "provider_slug": "oura",
    }
]).encode()


def sign(body: bytes, secret: str = SECRET) -> str:
    """Bare lowercase hex HMAC-SHA256 of the raw body, keyed with the secret."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-body-signature"] = signature
    return client.post("/webhooks/spike-api", content=body, headers=headers)


@pytest.mark.parametrize("body", [RECORD_CHANGE, INTEGRATION_CREATED, INTEGRATION_DELETED])
def test_valid_signature_accepted(body):
    assert post(body, sign(body)).status_code == 200


def test_batched_delivery_handles_every_event(caplog):
    with caplog.at_level(logging.INFO):
        post(RECORD_CHANGE, sign(RECORD_CHANGE))
    assert "User1" in caplog.text
    assert "User2" in caplog.text


def test_uppercase_hex_accepted():
    assert post(RECORD_CHANGE, sign(RECORD_CHANGE).upper()).status_code == 200


def test_any_content_type_verifies_exact_bytes():
    body = b'[ {"event_type":"provider_integration_created"} ]'
    assert post(body, sign(body), content_type="text/plain").status_code == 200


def test_missing_signature_401():
    assert post(RECORD_CHANGE).status_code == 401


def test_empty_signature_401():
    assert post(RECORD_CHANGE, "").status_code == 401


def test_wrong_secret_401():
    assert post(RECORD_CHANGE, sign(RECORD_CHANGE, "other")).status_code == 401


def test_tampered_body_401():
    tampered = RECORD_CHANGE.replace(b"User1", b"User9")
    assert post(tampered, sign(RECORD_CHANGE)).status_code == 401


@pytest.mark.parametrize(
    "bad",
    ["abc123", "a" * 65, "z" * 64, "sha256=" + sign(RECORD_CHANGE)],
)
def test_malformed_signature_401(bad):
    assert post(RECORD_CHANGE, bad).status_code == 401


def test_non_ascii_signature_401_not_500():
    # httpx cannot send non-ASCII header values, so call the verifier directly
    from main import verify_spike_signature

    assert verify_spike_signature(RECORD_CHANGE, "é" * 64, SECRET) is False


def test_signed_non_json_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400


@pytest.mark.parametrize("body", [b'{"event_type":"record_change"}', b'"hello"', b"null"])
def test_signed_non_array_400(body):
    assert post(body, sign(body)).status_code == 400


def test_wrong_typed_elements_and_fields_ignored():
    body = json.dumps([
        None,
        "text",
        7,
        [],
        {"event_type": 42},
        {"event_type": "record_change", "metrics": "steps", "application_user_id": {}, "provider_slug": 5},
        {"event_type": "record_change", "metrics": [1, None, "steps"]},
    ]).encode()
    assert post(body, sign(body)).status_code == 200


def test_missing_secret_500(monkeypatch):
    monkeypatch.delenv("SPIKE_API_WEBHOOK_SECRET")
    assert post(RECORD_CHANGE, sign(RECORD_CHANGE)).status_code == 500
