# Generated with: loops-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
from itertools import count

import pytest

# Test-only secret. The HMAC key is the base64-decoded part after whsec_.
SECRET = "whsec_" + base64.b64encode(b"loops-test-signing-key-012345678").decode()

os.environ["LOOPS_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_loops_webhook  # noqa: E402

client = TestClient(app)
_counter = count(1)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def new_event_id() -> str:
    return f"msg_test{next(_counter)}{time.time_ns()}"


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    webhook_id = webhook_id or new_event_id()
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": webhook_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, webhook_id, ts, secret),
    }


def post(raw_body, headers):
    return client.post("/webhooks/loops", content=raw_body, headers=headers)


CONTACT_IDENTITY = {"id": "cm4ittmhq0011ow9h6fb460yw", "email": "test@example.com", "userId": None}


def contact_created() -> str:
    # Payload from https://loops.so/docs/webhooks (Event types).
    return json.dumps(
        {
            "eventName": "contact.created",
            "eventTime": 1734425918,
            "webhookSchemaVersion": "1.0.0",
            "contactIdentity": {"id": "cm4itta800003ow9hhekzk94o", "email": "test+5@loops.so", "userId": None},
            "contact": {"id": "cm4itta800003ow9hhekzk94o", "email": "test+5@loops.so", "subscribed": True, "favoriteColor": "blue"},
        }
    )


def email_event(event_name: str) -> str:
    return json.dumps(
        {
            "eventName": event_name,
            "eventTime": 1734425918,
            "webhookSchemaVersion": "1.0.0",
            "sourceType": "campaign",
            "campaignId": "cm4t1suns001uw6atri87v54s",
            "email": {"id": "cm4t1sseg004tje7982991nan", "emailMessageId": "cm4ittv1v001oow9hruou8na8", "subject": "Subject"},
            "contactIdentity": CONTACT_IDENTITY,
        }
    )


TEST_EVENT = '{"eventName":"testing.testEvent","eventTime":1734425918,"message":"test","webhookSchemaVersion":"1.0.0"}'


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("LOOPS_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("LOOPS_WEBHOOK_TOLERANCE_SECONDS", raising=False)


# The published Standard Webhooks example (not a Loops secret). Same algorithm.
REF_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
REF_BODY = '{"test": 2432232314}'
REF_HEADERS = {
    "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
    "webhook-timestamp": "1614265330",
    "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
}


def test_reference_vector_with_and_without_whsec():
    assert verify_loops_webhook(REF_BODY, REF_HEADERS, REF_SECRET)
    assert verify_loops_webhook(REF_BODY.encode(), REF_HEADERS, REF_SECRET.removeprefix("whsec_"))


def test_reference_vector_fails_with_300s_tolerance():
    assert not verify_loops_webhook(REF_BODY, REF_HEADERS, REF_SECRET, 300)


def test_reference_vector_end_to_end(monkeypatch):
    monkeypatch.setenv("LOOPS_WEBHOOK_SECRET", REF_SECRET)
    res = post(REF_BODY, {"content-type": "application/json", **REF_HEADERS})
    assert res.status_code == 200


def test_accepts_contact_created():
    body = contact_created()
    res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize("event_name", ["email.delivered", "email.hardBounced", "email.spamReported"])
def test_accepts_email_events(event_name):
    body = email_event(event_name)
    assert post(body, signed_headers(body)).status_code == 200


def test_accepts_testing_test_event():
    assert post(TEST_EVENT, signed_headers(TEST_EVENT)).status_code == 200


def test_accepts_secret_without_whsec_prefix(monkeypatch):
    monkeypatch.setenv("LOOPS_WEBHOOK_SECRET", SECRET.removeprefix("whsec_"))
    body = contact_created()
    assert post(body, signed_headers(body)).status_code == 200


def test_acknowledges_unknown_event_name():
    body = json.dumps({"eventName": "some.futureEvent", "eventTime": 1, "webhookSchemaVersion": "1.0.0"})
    assert post(body, signed_headers(body)).status_code == 200


def test_accepts_either_signature_after_rolling_secret(monkeypatch):
    old_secret = "whsec_" + base64.b64encode(b"old-loops-signing-key-0123456789").decode()
    body = contact_created()
    webhook_id, ts = new_event_id(), str(now())
    signature = f"{sign(body, webhook_id, ts)} {sign(body, webhook_id, ts, old_secret)}"
    monkeypatch.setenv("LOOPS_WEBHOOK_SECRET", old_secret)
    assert post(body, signed_headers(body, webhook_id, ts, signature=signature)).status_code == 200


def test_duplicate_event_id_returns_200_duplicate():
    body = contact_created()
    webhook_id = new_event_id()
    first = post(body, signed_headers(body, webhook_id))
    again = post(body, signed_headers(body, webhook_id, now() + 5))
    assert first.status_code == 200
    assert again.json() == {"received": True, "duplicate": True}


def test_accepts_old_timestamp_without_tolerance():
    body = contact_created()
    assert post(body, signed_headers(body, timestamp=now() - 3600)).status_code == 200


def test_rejects_missing_headers():
    assert post(contact_created(), {"content-type": "application/json"}).status_code == 400


def test_rejects_other_secret():
    other = base64.b64encode(b"some-other-secret-key-0123456789").decode()
    body = contact_created()
    assert post(body, signed_headers(body, secret=other)).status_code == 400


def test_rejects_secret_string_used_as_key():
    body = contact_created()
    webhook_id, ts = new_event_id(), str(now())
    wrong = hmac.new(SECRET.encode(), f"{webhook_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
    sig = "v1," + base64.b64encode(wrong).decode()
    assert post(body, signed_headers(body, webhook_id, ts, signature=sig)).status_code == 400


def test_ignores_non_v1_entries():
    body = contact_created()
    webhook_id, ts = new_event_id(), str(now())
    sig = sign(body, webhook_id, ts).replace("v1,", "v2,")
    assert post(body, signed_headers(body, webhook_id, ts, signature=sig)).status_code == 400


def test_rejects_tampered_body():
    body = contact_created()
    headers = signed_headers(body)
    assert post(body.replace("blue", "red"), headers).status_code == 400


def test_rejects_stale_timestamp_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("LOOPS_WEBHOOK_TOLERANCE_SECONDS", "300")
    body = contact_created()
    assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("LOOPS_WEBHOOK_SECRET")
    body = contact_created()
    assert post(body, signed_headers(body)).status_code == 500
