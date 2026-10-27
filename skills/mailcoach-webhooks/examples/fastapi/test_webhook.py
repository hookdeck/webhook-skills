import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Any string works: Mailcoach uses the secret as-is (UTF-8), not decoded
SECRET = "test_mailcoach_webhook_secret"
os.environ["MAILCOACH_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def subscriber_payload(event: str = "SubscribedEvent") -> bytes:
    return json.dumps({
        "event": event,
        "email_list_uuid": "8d0c2a8e-1c5b-4e0a-9d54-0f9b1b6a7c11",
        "email": "jane@example.com",
        "first_name": "Jane",
        "last_name": "Doe",
        "extra_attributes": [],
        "tags": ["newsletter"],
        "subscribed_at": "2026-10-26T09:00:00.000000Z",
        "unsubscribed_at": None,
        "created_at": "2026-10-26T08:59:00.000000Z",
        "updated_at": "2026-10-26T09:00:00.000000Z",
    }).encode()


def campaign_payload() -> bytes:
    return json.dumps({
        "event": "CampaignSentEvent",
        "uuid": "3f6d7a1c-6b0e-4a39-8a4c-2c1d9e0b5f22",
        "name": "October newsletter",
        "email_list_uuid": "8d0c2a8e-1c5b-4e0a-9d54-0f9b1b6a7c11",
        "status": "sent",
        "sent_to_number_of_subscribers": 1280,
    }).encode()


def post(body: bytes, signature: str | bytes | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["signature"] = signature
    return client.post("/webhooks/mailcoach", content=body, headers=headers)


@pytest.mark.parametrize("event", ["SubscribedEvent", "UnsubscribedEvent", "UnconfirmedSubscriberCreatedEvent"])
def test_valid_subscriber_events(event):
    body = subscriber_payload(event)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_valid_campaign_sent():
    body = campaign_payload()
    assert post(body, sign(body)).status_code == 200


def test_any_content_type_uses_raw_bytes():
    body = subscriber_payload()
    assert post(body, sign(body), "text/plain").status_code == 200


def test_non_canonical_json_is_verified_as_sent():
    body = b'{ "event" : "SubscribedEvent",\n  "email":"a@b.co" }'
    assert post(body, sign(body)).status_code == 200


def test_uppercase_hex_digest():
    body = subscriber_payload()
    assert post(body, sign(body).upper()).status_code == 200


def test_unhandled_event_with_valid_signature():
    body = subscriber_payload("TagAddedEvent")
    assert post(body, sign(body)).status_code == 200


def test_missing_signature_is_rejected():
    assert post(subscriber_payload()).status_code == 401


def test_empty_signature_is_rejected():
    assert post(subscriber_payload(), "").status_code == 401


def test_wrong_secret():
    body = subscriber_payload()
    assert post(body, sign(body, "wrong_secret")).status_code == 401


def test_tampered_body():
    body = subscriber_payload()
    assert post(body.replace(b"jane@", b"eve@"), sign(body)).status_code == 401


def test_re_encoded_body_is_rejected():
    body = subscriber_payload()
    reencoded = json.dumps(json.loads(body), indent=2).encode()
    assert post(reencoded, sign(body)).status_code == 401


def test_prefixed_non_hex_or_wrong_length_digest():
    body = subscriber_payload()
    good = sign(body)
    for bad in ["sha256=" + good, "zz" + good[2:], good[2:], good + "ab"]:
        assert post(body, bad).status_code == 401


def test_non_ascii_signature_header_is_401_not_500():
    body = subscriber_payload()
    assert post(body, "é".encode("latin-1") * 64).status_code == 401


def test_valid_signature_over_invalid_json():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400
