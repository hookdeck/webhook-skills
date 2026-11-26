# Generated with: 360learning-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
from itertools import count

import pytest

# Test-only secret. The HMAC key is the base64-decoded secret.
SECRET = "whsec_" + base64.b64encode(b"360learning-test-signing-key-012").decode()

os.environ["THREE_SIXTY_LEARNING_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, parse_secrets, verify_360learning_webhook  # noqa: E402

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
    return client.post("/webhooks/360learning", content=raw_body, headers=headers)


def user_created() -> str:
    # Shape from 360Learning's "Event payload and headers" page (timestamp in ms).
    return json.dumps(
        {
            "type": "user.created",
            "timestamp": 1749816650724,
            "data": {
                "userId": "684c154ab06eb32565e5cbc0",
                "createdAt": "2025-06-13T12:10:50.568Z",
                "firstName": "Ada",
                "lastName": "Lovelace",
                "mail": "Ada.Lovelace@domain.com",
            },
        }
    )


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("THREE_SIXTY_LEARNING_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS", raising=False)


# The published Standard Webhooks / Svix example (not a 360Learning secret).
REF_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
REF_BODY = '{"test": 2432232314}'
REF_HEADERS = {
    "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
    "webhook-timestamp": "1614265330",
    "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
}


def test_reference_vector_with_and_without_whsec():
    assert verify_360learning_webhook(REF_BODY, REF_HEADERS, REF_SECRET)
    assert verify_360learning_webhook(REF_BODY.encode(), REF_HEADERS, REF_SECRET.removeprefix("whsec_"))


def test_reference_vector_fails_with_5_minute_tolerance():
    assert not verify_360learning_webhook(REF_BODY, REF_HEADERS, REF_SECRET, 300)


def test_reference_vector_end_to_end(monkeypatch):
    monkeypatch.setenv("THREE_SIXTY_LEARNING_WEBHOOK_SECRET", REF_SECRET)
    res = post(REF_BODY, {"content-type": "application/json", **REF_HEADERS})
    assert res.status_code == 200


def test_verifies_raw_body_that_reserialisation_would_change():
    body = '{\n  "type": "user.updated",\n  "timestamp": 1749816650724,\n  "data": { "userId": "684c154ab06eb32565e5cbc0", "lastName": "Lov\\u00e9lace" }\n}'
    reserialised = json.dumps(json.loads(body), separators=(",", ":"), ensure_ascii=False)
    assert reserialised != body
    headers = signed_headers(body)
    assert post(body, headers).status_code == 200
    assert not verify_360learning_webhook(reserialised, headers, SECRET)


def test_accepts_user_created():
    body = user_created()
    res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_course_attempt_closed():
    body = json.dumps(
        {
            "type": "course.attempt.closed",
            "timestamp": 1748346292000,
            "data": {
                "attemptId": "507f1f77bcf86cd799439011",
                "closedAt": "2025-06-13T12:10:50.568Z",
                "userId": "507f1f77bcf86cd799439012",
                "courseId": "507f1f77bcf86cd799439013",
                "reason": "learnerFinished",
                "context": {},
            },
        }
    )
    assert post(body, signed_headers(body)).status_code == 200


def test_accepts_xapi_statement_without_type():
    body = json.dumps(
        {
            "id": "6b951307-9deb-47f5-b8f9-65e505bac3e4",
            "actor": {"objectType": "Agent", "mbox": "mailto:john.smith@yopmail.com"},
            "verb": {"id": "http://adlnet.gov/expapi/verbs/initialized", "display": {"en-US": "initialized"}},
            "object": {"objectType": "Activity", "id": "urn:360learning:course:507f1f77bcf86cd799439011"},
            "context": {},
            "timestamp": "2025-06-13T12:10:50.568Z",
        }
    )
    assert post(body, signed_headers(body)).status_code == 200


def test_accepts_secret_without_whsec_prefix(monkeypatch):
    monkeypatch.setenv("THREE_SIXTY_LEARNING_WEBHOOK_SECRET", SECRET.removeprefix("whsec_"))
    body = user_created()
    assert post(body, signed_headers(body)).status_code == 200


def test_accepts_any_of_several_subscription_secrets(monkeypatch):
    other = base64.b64encode(b"second-subscription-secret-01234").decode()
    monkeypatch.setenv("THREE_SIXTY_LEARNING_WEBHOOK_SECRET", f"{SECRET}, {other}")
    assert len(parse_secrets(os.environ["THREE_SIXTY_LEARNING_WEBHOOK_SECRET"])) == 2
    body = user_created()
    assert post(body, signed_headers(body, secret=other)).status_code == 200


def test_acknowledges_unknown_event_type():
    body = json.dumps({"type": "some.future.event", "timestamp": 1, "data": {}})
    assert post(body, signed_headers(body)).status_code == 200


def test_accepts_either_signature_during_rotation(monkeypatch):
    legacy = "whsec_" + base64.b64encode(b"legacy-360learning-signing-key-0").decode()
    fresh = "whsec_" + base64.b64encode(b"rotated-360learning-signing-key0").decode()
    monkeypatch.setenv("THREE_SIXTY_LEARNING_WEBHOOK_SECRET", legacy)
    body = user_created()
    webhook_id, ts = new_event_id(), str(now())
    # Header order from the docs: "v1,<new_signature> v1,<legacy_signature>"
    signature = f"{sign(body, webhook_id, ts, fresh)} {sign(body, webhook_id, ts, legacy)}"
    assert post(body, signed_headers(body, webhook_id, ts, signature=signature)).status_code == 200


def test_duplicate_event_id_returns_200_duplicate():
    body = user_created()
    webhook_id = new_event_id()
    first = post(body, signed_headers(body, webhook_id))
    retry = post(body, signed_headers(body, webhook_id, now() + 5))
    assert first.status_code == 200
    assert retry.json() == {"received": True, "duplicate": True}


def test_accepts_old_timestamp_without_tolerance():
    body = user_created()
    assert post(body, signed_headers(body, timestamp=now() - 3600)).status_code == 200


def test_rejects_missing_headers():
    assert post(user_created(), {"content-type": "application/json"}).status_code == 400


def test_rejects_other_secret():
    other = base64.b64encode(b"some-other-secret-key-0123456789").decode()
    body = user_created()
    assert post(body, signed_headers(body, secret=other)).status_code == 400


def test_rejects_secret_string_used_as_key():
    body = user_created()
    webhook_id, ts = new_event_id(), str(now())
    wrong = hmac.new(SECRET.encode(), f"{webhook_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
    sig = "v1," + base64.b64encode(wrong).decode()
    assert post(body, signed_headers(body, webhook_id, ts, signature=sig)).status_code == 400


def test_ignores_non_v1_entries():
    body = user_created()
    webhook_id, ts = new_event_id(), str(now())
    sig = sign(body, webhook_id, ts).replace("v1,", "v2,")
    assert post(body, signed_headers(body, webhook_id, ts, signature=sig)).status_code == 400


def test_rejects_tampered_body():
    body = user_created()
    headers = signed_headers(body)
    assert post(body.replace("Ada", "Eve"), headers).status_code == 400


def test_rejects_stale_timestamp_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS", "300")
    body = user_created()
    assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("THREE_SIXTY_LEARNING_WEBHOOK_SECRET")
    body = user_created()
    assert post(body, signed_headers(body)).status_code == 500
