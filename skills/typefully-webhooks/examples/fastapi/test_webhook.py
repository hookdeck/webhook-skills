import hashlib
import hmac
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "typefully_test_secret"
os.environ["TYPEFULLY_WEBHOOK_SECRET"] = SECRET

from main import app, verify_typefully  # noqa: E402

client = TestClient(app)


def payload(event="draft.created") -> bytes:
    return ('{"event": "%s", "data": {"id": 12345, "social_set_id": 67890, "status": "draft", "draft_title": "Weekly Newsletter"}}' % event).encode()


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Same algorithm as Typefully: HMAC-SHA256 hex of "<timestamp>.<body>", sent as "sha256=<hex>"."""
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def now() -> str:
    return str(int(time.time()))


def post(body: bytes, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/typefully",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


@pytest.fixture(autouse=True)
def clear_tolerance(monkeypatch):
    monkeypatch.delenv("TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def test_accepts_valid_sha256_prefixed_signature():
    body, ts = payload(), now()
    res = post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={sign(body, ts)}"})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_bare_digest_and_uppercase_hex():
    body, ts = payload("draft.published"), now()
    digest = sign(body, ts)
    assert post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": digest}).status_code == 200
    assert post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={digest.upper()}"}).status_code == 200


def test_verifies_exact_raw_bytes_with_whitespace_and_non_ascii():
    body = '{ "event" : "draft.created",\n "data": {"id": 1, "draft_title": "Café ☕"} }'.encode()
    ts = now()
    res = post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={sign(body, ts)}"})
    assert res.status_code == 200


def test_works_with_non_json_content_type():
    body, ts = payload(), now()
    res = post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={sign(body, ts)}"}, "text/plain")
    assert res.status_code == 200


@pytest.mark.parametrize("event", ["draft.planned", "draft.scheduled", "draft.status_changed", "draft.tags_changed", "draft.deleted"])
def test_handles_events(event):
    body, ts = payload(event), now()
    res = post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={sign(body, ts)}"})
    assert res.status_code == 200


def test_rejects_missing_signature_or_timestamp():
    body, ts = payload(), now()
    assert post(body, {"X-Typefully-Timestamp": ts}).status_code == 401
    assert post(body, {"X-Typefully-Signature": f"sha256={sign(body, ts)}"}).status_code == 401


def test_rejects_malformed_signatures():
    body, ts = payload(), now()
    good = sign(body, ts)
    for bad in ["sha256=", "sha256=zz", f"sha256={good[1:]}", f"sha256={good}00", f"sha256={good[:63]}g", "sha1=" + good]:
        res = post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": bad})
        assert res.status_code == 401, bad


def test_rejects_tampered_body_timestamp_and_secret():
    body, ts = payload(), now()
    sig = f"sha256={sign(body, ts)}"
    assert post(body.replace(b"12345", b"99999"), {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": sig}).status_code == 401
    assert post(body, {"X-Typefully-Timestamp": str(int(ts) + 1), "X-Typefully-Signature": sig}).status_code == 401
    forged = f"sha256={sign(body, ts, 'other_secret')}"
    assert post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": forged}).status_code == 401


def test_valid_signature_but_invalid_json_is_400():
    body, ts = b"not json", now()
    res = post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={sign(body, ts)}"})
    assert res.status_code == 400


def test_old_timestamps_accepted_by_default():
    body, ts = payload(), str(int(time.time()) - 86400)
    res = post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={sign(body, ts)}"})
    assert res.status_code == 200


def test_tolerance_opt_in(monkeypatch):
    monkeypatch.setenv("TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS", "300")
    body = payload()
    old = str(int(time.time()) - 3600)
    assert post(body, {"X-Typefully-Timestamp": old, "X-Typefully-Signature": f"sha256={sign(body, old)}"}).status_code == 401
    ts = now()
    assert post(body, {"X-Typefully-Timestamp": ts, "X-Typefully-Signature": f"sha256={sign(body, ts)}"}).status_code == 200


def test_verify_function_directly():
    body, ts = payload(), now()
    assert verify_typefully(body, ts, f"sha256={sign(body, ts)}", SECRET) is True
    assert verify_typefully(body, ts, "", SECRET) is False
    assert verify_typefully(body, ts, f"sha256={sign(body, ts)}", "") is False
