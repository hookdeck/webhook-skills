import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "test_tidio_webhook_secret"
os.environ["TIDIO_WEBHOOK_SECRET"] = SECRET

from main import app, processed_webhook_ids  # noqa: E402

client = TestClient(app)
_counter = 0


def sign(body: bytes, timestamp: int, key: str = SECRET) -> str:
    """hex HMAC-SHA256 of `<body>_<t>`, exactly as Tidio documents."""
    return hmac.new(key.encode(), body + b"_" + str(timestamp).encode(), hashlib.sha256).hexdigest()


def envelope(topic: str, content: dict, webhook_id: str = None) -> bytes:
    global _counter
    _counter += 1
    return json.dumps(
        {
            "created_at": int(time.time()),
            "project_public_key": "m8ixolegtgfvo6ckzvmuempdq0obbqsy",
            "topic": topic,
            "version": 1,
            "webhook_id": webhook_id or f"00000000-0000-4000-8000-{_counter:012d}",
            "content": content,
        }
    ).encode()


def post(body: bytes, header=None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if header is not None:
        headers["x-tidio-signature"] = header
    return client.post("/webhooks/tidio", content=body, headers=headers)


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    processed_webhook_ids.clear()
    monkeypatch.delenv("TIDIO_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_accepts_valid_signature():
    body = envelope("contact.created", {"id": "c1", "email": "a@example.com"})
    t = int(time.time())
    res = post(body, f"t={t},s={sign(body, t)}")
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize(
    "topic,content",
    [
        ("contact.updated", {"id": "c1"}),
        ("conversation.solved_by_operator", {"contact_id": "c1", "solved_at": "2023-01-01T00:00:00+00:00"}),
        ("conversation.solved_by_lyro", {"contact_id": "c1", "reason": "handoff"}),
        ("ticket.created", {"id": 10000, "subject": "A delivery problem", "status": "open"}),
        ("ticket.status_updated", {"id": 10000, "status": "solved"}),
        ("customer_satisfaction.rated", {"type": "operator", "score": 5}),
        ("ticket.holder_changed", {"ticket_id": 10000, "new_holder": "ai_assistant"}),
    ],
)
def test_handles_topics(topic, content):
    body = envelope(topic, content)
    t = int(time.time())
    assert post(body, f"t={t},s={sign(body, t)}").status_code == 200


def test_accepts_when_any_s_matches():
    body = envelope("contact.created", {"id": "c1"})
    t = int(time.time())
    res = post(body, f"t={t},s={sign(body, t, 'previous_secret')},s={sign(body, t)}")
    assert res.status_code == 200


def test_verifies_exact_bytes_for_any_content_type():
    body = envelope("contact.created", {"id": "c1"})
    t = int(time.time())
    assert post(body, f"t={t},s={sign(body, t)}", "text/plain").status_code == 200


def test_verifies_non_ascii_and_odd_formatting_byte_for_byte():
    body = '{ "topic" : "contact.created",\n "webhook_id":"w-odd", "content": {"first_name":"Zoë ☕"} }'.encode()
    t = int(time.time())
    assert post(body, f"t={t},s={sign(body, t)}").status_code == 200


def test_rejects_modified_body():
    body = envelope("contact.created", {"id": "c1"})
    t = int(time.time())
    assert post(body.replace(b"c1", b"c2"), f"t={t},s={sign(body, t)}").status_code == 401


def test_rejects_wrong_secret():
    body = envelope("contact.created", {"id": "c1"})
    t = int(time.time())
    assert post(body, f"t={t},s={sign(body, t, 'wrong_secret')}").status_code == 401


def test_rejects_when_t_does_not_match_signed_timestamp():
    body = envelope("contact.created", {"id": "c1"})
    t = int(time.time())
    assert post(body, f"t={t + 1},s={sign(body, t)}").status_code == 401


def test_rejects_wrong_order_timestamp_first():
    body = envelope("contact.created", {"id": "c1"})
    t = int(time.time())
    wrong = hmac.new(SECRET.encode(), str(t).encode() + b"_" + body, hashlib.sha256).hexdigest()
    assert post(body, f"t={t},s={wrong}").status_code == 401


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "s=" + "a" * 64,
        "t=1680652800",
        "t=,s=" + "a" * 64,
        "t=1680652800,s=abcd",
        "t=1680652800,s=" + "z" * 64,
        "t=1680652800,s=" + "a" * 65,
        "t=1680652800,s=" + "a" * 64 + "\n",
    ],
)
def test_returns_401_for_missing_or_malformed_header(header):
    assert post(envelope("contact.created", {"id": "c1"}), header).status_code == 401


def test_hex_is_case_insensitive():
    body = envelope("contact.created", {"id": "c1"})
    t = int(time.time())
    assert post(body, f"t={t},s={sign(body, t).upper()}").status_code == 200


def test_returns_400_for_signed_non_json():
    body = b"not json"
    t = int(time.time())
    assert post(body, f"t={t},s={sign(body, t)}", "text/plain").status_code == 400


def test_old_timestamps_accepted_by_default():
    body = envelope("contact.created", {"id": "c1"})
    t = 1680652800
    assert post(body, f"t={t},s={sign(body, t)}").status_code == 200


def test_opt_in_tolerance_rejects_old_timestamps(monkeypatch):
    monkeypatch.setenv("TIDIO_WEBHOOK_TOLERANCE_SECONDS", "300")
    body = envelope("contact.created", {"id": "c1"})
    old = int(time.time()) - 3600
    assert post(body, f"t={old},s={sign(body, old)}").status_code == 401
    fresh = int(time.time())
    assert post(body, f"t={fresh},s={sign(body, fresh)}").status_code == 200


def test_dedupes_on_webhook_id():
    body = envelope("contact.created", {"id": "c1"}, "dup-1")
    t = int(time.time())
    header = f"t={t},s={sign(body, t)}"
    assert post(body, header).json() == {"received": True}
    second = post(body, header)
    assert second.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}
