import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "cs_whsec_test_secret_key"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CHARITYSTACK_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS", raising=False)


from main import app, verify_charitystack_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Matches CharityStack's algorithm: HMAC-SHA256 over `{timestamp}.{raw body}`, hex."""
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def now() -> str:
    return str(int(time.time()))


def post(body: bytes, headers: dict, content_type: str = "application/json"):
    return client.post(
        "/webhooks/charitystack",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


BODY = json.dumps({"type": "donation.created", "data": {"note": "Spenden für alle"}}).encode()


def test_accepts_valid_prefixed_signature():
    ts = now()
    res = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": ts, "X-Webhook-ID": "del_1"})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_bare_hex_digest():
    ts = now()
    assert post(BODY, {"X-Webhook-Signature": sign(BODY, ts), "X-Webhook-Timestamp": ts}).status_code == 200


def test_compares_hex_case_insensitively():
    ts = now()
    res = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts).upper()}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 200


def test_verifies_raw_bytes_whatever_the_content_type():
    ts = now()
    res = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": ts}, "text/plain")
    assert res.status_code == 200


def test_rejects_missing_signature():
    assert post(BODY, {"X-Webhook-Timestamp": now()}).status_code == 401


def test_rejects_missing_timestamp():
    assert post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, now())}"}).status_code == 401


@pytest.mark.parametrize("bad", ["sha256=", "sha256=zz", "sha256=" + "g" * 64])
def test_rejects_malformed_signature(bad):
    assert post(BODY, {"X-Webhook-Signature": bad, "X-Webhook-Timestamp": now()}).status_code == 401


def test_rejects_overlong_signature():
    ts = now()
    assert post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}00", "X-Webhook-Timestamp": ts}).status_code == 401


def test_rejects_wrong_secret():
    ts = now()
    res = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts, 'other_secret')}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_tampered_body():
    ts = now()
    res = post(b'{"type":"donation.updated"}', {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_reserialised_body():
    pretty = json.dumps(json.loads(BODY), indent=2).encode()
    ts = now()
    res = post(pretty, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_unsigned_timestamp():
    ts = now()
    res = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": str(int(ts) + 1)})
    assert res.status_code == 401


def test_accepts_old_timestamps_by_default():
    ts = str(int(time.time()) - 86400)
    res = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 200


def test_rejects_old_timestamps_when_tolerance_enabled(monkeypatch):
    monkeypatch.setenv("CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS", "300")
    old = str(int(time.time()) - 3600)
    stale = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, old)}", "X-Webhook-Timestamp": old})
    assert stale.status_code == 401
    ts = now()
    fresh = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": ts})
    assert fresh.status_code == 200


def test_returns_400_for_signed_non_json_body():
    ts = now()
    res = post(b"not json", {"X-Webhook-Signature": f"sha256={sign(b'not json', ts)}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 400


@pytest.mark.parametrize(
    "event_type",
    [
        "donation.created",
        "donation.updated",
        "subscription.created",
        "subscription.updated",
        "subscription.cancelled",
        "subscription.payment_method_updated",
        "contact.created",
        "contact.updated",
        "form.created",
        "form.updated",
        "something.new",
    ],
)
def test_acknowledges_event_types(event_type):
    payload = json.dumps({"type": event_type}).encode()
    ts = now()
    res = post(payload, {"X-Webhook-Signature": f"sha256={sign(payload, ts)}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 200


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("CHARITYSTACK_WEBHOOK_SECRET")
    ts = now()
    res = post(BODY, {"X-Webhook-Signature": f"sha256={sign(BODY, ts)}", "X-Webhook-Timestamp": ts})
    assert res.status_code == 500


def test_secret_is_utf8_bytes_not_hex_decoded():
    ts = "1700000000"
    secret = "deadbeefdeadbeef"
    ok, _ = verify_charitystack_signature(BODY, sign(BODY, ts, secret), ts, secret)
    assert ok


def test_tolerance_uses_supplied_clock():
    ts = "1700000000"
    sig = f"sha256={sign(BODY, ts)}"
    assert verify_charitystack_signature(BODY, sig, ts, SECRET, 300, 1700000100)[0]
    assert not verify_charitystack_signature(BODY, sig, ts, SECRET, 300, 1700000400)[0]
