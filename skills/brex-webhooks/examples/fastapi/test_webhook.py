# Generated with: brex-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
from itertools import count

import pytest

# Brex's guide shows the secret as bare base64; the HMAC key is its decoded bytes.
SECRET = base64.b64encode(b"brex-test-signing-key-0123456789").decode()

os.environ["BREX_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_brex_webhook  # noqa: E402

client = TestClient(app)
_counter = count(1)


def sign(raw_body: str, webhook_id: str, timestamp: str, secret: str = SECRET) -> str:
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{webhook_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def new_message_id() -> str:
    return f"msg_test{next(_counter)}{time.time_ns()}"


def signed_headers(raw_body, webhook_id=None, timestamp=None, secret=SECRET, signature=None):
    webhook_id = webhook_id or new_message_id()
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": webhook_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, webhook_id, ts, secret),
    }


def post(raw_body, headers):
    return client.post("/webhooks/brex", content=raw_body, headers=headers)


def transfer(event_type="TRANSFER_PROCESSED") -> str:
    return json.dumps(
        {
            "event_type": event_type,
            "transfer_id": "dptx_ckyypz30n000101kgzgnrtqlf",
            "payment_type": "ACH",
            "company_id": "cuacc_ckqckhadg000601r95ox48c2s",
        }
    )


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("BREX_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("BREX_WEBHOOK_TOLERANCE_SECONDS", raising=False)


# Brex's documented sample (https://developer.brex.com/guides/webhooks).
DOC_SECRET = "4j7OxQ4wlv1GmkZ9qLjoFjEFXjpzvHkr"
DOC_BODY = '{"event_type": "TRANSFER_PROCESSED", "transfer_id": "dptx_ckyypz30n000101kgzgnrtqlf", "company_id": "cuacc_ckqckhadg000601r95ox48c2s"}'
DOC_HEADERS = {
    "webhook-id": "msg_24Ky2257Hzd0tgc5bWs8TwK9Kod",
    "webhook-timestamp": "1643393361",
    "webhook-signature": "v1,6mFFi/Bg0gw1Yz2KJwZSVq6Bh+XzllS7JVltAlZ8yCU= v1,9dEEi/Bg0gw1Yz2KJwZSVq6Bh+XzllS7JVltAlZ8yDY=",
}


def test_documented_example_bare_and_whsec():
    assert verify_brex_webhook(DOC_BODY, DOC_HEADERS, DOC_SECRET)
    assert verify_brex_webhook(DOC_BODY.encode(), DOC_HEADERS, "whsec_" + DOC_SECRET)


def test_documented_example_fails_with_60s_tolerance():
    assert not verify_brex_webhook(DOC_BODY, DOC_HEADERS, DOC_SECRET, 60)


def test_documented_example_end_to_end(monkeypatch):
    monkeypatch.setenv("BREX_WEBHOOK_SECRET", DOC_SECRET)
    res = post(DOC_BODY, {"content-type": "application/json", **DOC_HEADERS})
    assert res.status_code == 200


@pytest.mark.parametrize("event_type", ["TRANSFER_PROCESSED", "TRANSFER_FAILED"])
def test_accepts_transfer_events(event_type):
    body = transfer(event_type)
    res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_whsec_prefixed_secret(monkeypatch):
    monkeypatch.setenv("BREX_WEBHOOK_SECRET", "whsec_" + SECRET)
    body = transfer()
    assert post(body, signed_headers(body)).status_code == 200


def test_acknowledges_unknown_event_type():
    body = json.dumps({"event_type": "SOME_FUTURE_EVENT"})
    assert post(body, signed_headers(body)).status_code == 200


def test_accepts_any_of_two_signatures_key_rotation():
    old_secret = base64.b64encode(b"old-brex-signing-key-0123456789x").decode()
    body = transfer()
    webhook_id, ts = new_message_id(), str(now())
    headers = signed_headers(body, webhook_id, ts)
    headers["webhook-signature"] = f"{sign(body, webhook_id, ts, old_secret)} {headers['webhook-signature']}"
    assert post(body, headers).status_code == 200


def test_duplicate_message_id_returns_200_duplicate():
    body = transfer()
    webhook_id = new_message_id()
    first = post(body, signed_headers(body, webhook_id))
    resend = post(body, signed_headers(body, webhook_id, now() + 1))
    assert first.status_code == 200
    assert resend.json() == {"received": True, "duplicate": True}


def test_rejects_missing_headers():
    assert post(transfer(), {"content-type": "application/json"}).status_code == 400


def test_rejects_other_secret():
    other = base64.b64encode(b"some-other-secret-key-0123456789").decode()
    body = transfer()
    assert post(body, signed_headers(body, secret=other)).status_code == 400


def test_rejects_secret_string_used_as_key():
    body = transfer()
    webhook_id, ts = new_message_id(), str(now())
    wrong = hmac.new(SECRET.encode(), f"{webhook_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
    sig = "v1," + base64.b64encode(wrong).decode()
    assert post(body, signed_headers(body, webhook_id, ts, signature=sig)).status_code == 400


def test_rejects_tampered_body():
    body = transfer()
    headers = signed_headers(body)
    assert post(body.replace("ACH", "DOMESTIC_WIRE"), headers).status_code == 400


def test_rejects_stale_timestamp_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("BREX_WEBHOOK_TOLERANCE_SECONDS", "60")
    body = transfer()
    assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("BREX_WEBHOOK_SECRET")
    body = transfer()
    assert post(body, signed_headers(body)).status_code == 500
