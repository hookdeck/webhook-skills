import hashlib
import hmac
import itertools
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# whsec_ secrets are used whole as a plain UTF-8 HMAC key (not Standard Webhooks)
SECRET = "whsec_test_secret_key_123"
os.environ["LEARNHOUSE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)
_counter = itertools.count()


def hmac_hex(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac_hex(body, secret)


def envelope(event: str, data=None) -> bytes:
    return json.dumps(
        {
            "event": event,
            "delivery_id": f"dlv_test_{time.time_ns()}_{next(_counter)}",
            "timestamp": "2026-06-22T12:00:00Z",
            "org_id": 1,
            "data": {} if data is None else data,
        }
    ).encode()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Webhook-Signature"] = signature
    return client.post("/webhooks/learnhouse", content=body, headers=headers)


def test_accepts_valid_signature():
    body = envelope(
        "course_completed",
        {
            "user": {"user_uuid": "user_1", "email": "learner@example.com", "username": "learner"},
            "course": {"course_uuid": "course_1", "name": "Introduction to Python"},
        },
    )
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_bare_and_uppercase_digest():
    a = envelope("ping")
    assert post(a, hmac_hex(a)).status_code == 200
    b = envelope("ping")
    assert post(b, "sha256=" + hmac_hex(b).upper()).status_code == 200


def test_verifies_raw_bytes_for_any_content_type():
    body = envelope("ping")
    assert post(body, sign(body), "text/plain").status_code == 200


def test_key_is_whole_whsec_string():
    body = envelope("ping")
    assert post(body, sign(body, SECRET[len("whsec_"):])).status_code == 401


def test_rejects_bad_signatures_with_401():
    body = envelope("ping")
    good = hmac_hex(body)
    for sig in [None, "", "sha256=", "sha256=abc", f"sha256={good[:63]}z", f"sha256={good}00", "sha1=" + good, sign(body, "other")]:
        assert post(body, sig).status_code == 401


def test_rejects_tampered_body():
    body = envelope("ping")
    assert post(body.replace(b"ping", b"pong"), sign(body)).status_code == 401


@pytest.mark.parametrize("body", [b"not json", b"[1,2]", b'"str"', b'{"event":5}', b"", b"\xff\xfe"])
def test_signed_non_object_body_is_400(body):
    assert post(body, sign(body), "text/plain").status_code == 400


@pytest.mark.parametrize(
    "data",
    ["x", None, [], {"user": "x", "course": [1]}, {"user": {"email": 5}, "course": {"name": {}}}],
)
def test_wrong_typed_nested_fields_are_ignored(data):
    body = envelope("course_completed")
    obj = json.loads(body)
    obj["data"] = data
    body = json.dumps(obj).encode()
    assert post(body, sign(body)).status_code == 200


@pytest.mark.parametrize(
    "event",
    ["ping", "course_enrolled", "activity_completed", "assignment_submitted", "assignment_graded", "certificate_claimed", "user_signed_up", "pack_activated"],
)
def test_known_and_unknown_events(event):
    body = envelope(event)
    assert post(body, sign(body)).status_code == 200


def test_duplicate_delivery_id_is_flagged():
    body = envelope("course_enrolled")
    assert "duplicate" not in post(body, sign(body)).json()
    second = post(body, sign(body))
    assert second.status_code == 200
    assert second.json()["duplicate"] is True
