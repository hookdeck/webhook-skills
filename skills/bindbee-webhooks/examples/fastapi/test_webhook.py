import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "bb_sig_test_secret_Value-123"  # Bindbee secrets have no prefix; used as raw UTF-8 bytes
os.environ["BINDBEE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_bindbee_signature  # noqa: E402

client = TestClient(app)


def sign(webhook_id: str, timestamp: str, body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Bindbee: v1,base64(HMAC-SHA256(key, id.timestamp.body))."""
    key = base64.b64decode(secret[6:]) if secret.startswith("whsec_") else secret.encode()
    digest = hmac.new(key, f"{webhook_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def payload(event: str) -> bytes:
    return json.dumps({
        "id": "evt_123",
        "event": event,
        "version": "2026.10.06",
        "sequence": 7,
        "occurred_at": "2026-10-06T10:00:00Z",
        "webhook": {"event": event},
        "connector": {"id": "con_1"},
        "data": {"id": "emp_1"},
    }).encode()


def post(body: bytes, headers: dict | None = None, content_type: str = "application/json"):
    ts = str(int(time.time()))
    h = {
        "content-type": content_type,
        "webhook-id": "msg_1",
        "webhook-timestamp": ts,
        "webhook-signature": sign("msg_1", ts, body),
    }
    h.update(headers or {})
    return client.post("/webhooks/bindbee", content=body, headers=h)


EVENTS = [
    "connector.linked",
    "connector.relinked",
    "connector.relink_needed",
    "connector.sync.started",
    "connector.sync.completed",
    "connector.sync.failed",
    "hris.employee.created",
    "hris.employee.updated",
    "hris.location.created",
]


class TestRoute:
    @pytest.mark.parametrize("event", EVENTS)
    def test_accepts_valid_delivery(self, event):
        res = post(payload(event))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_wrong_signature(self):
        assert post(payload("connector.linked"), {"webhook-signature": "v1,AAAA"}).status_code == 400

    def test_rejects_tampered_body(self):
        ts = str(int(time.time()))
        sig = sign("msg_1", ts, payload("connector.linked"))
        res = post(payload("hris.employee.created"), {"webhook-timestamp": ts, "webhook-signature": sig})
        assert res.status_code == 400

    def test_rejects_missing_headers(self):
        res = client.post("/webhooks/bindbee", content=payload("connector.linked"))
        assert res.status_code == 400

    def test_accepts_any_content_type(self):
        assert post(payload("connector.linked"), content_type="text/plain").status_code == 200


class TestVerify:
    body = payload("connector.linked")
    ts = str(int(time.time()))
    good = sign("m1", ts, body)

    def check(self, sig, secret=SECRET, ts=None, tolerance=0):
        return verify_bindbee_signature(self.body, "m1", ts or self.ts, sig, secret, tolerance)

    def test_valid(self):
        assert self.check(self.good)

    def test_any_matching_v1_entry_and_ignores_other_versions(self):
        assert self.check(f"v1a,{self.good[3:]} v1,AAAA {self.good}")
        assert not self.check(f"v1a,{self.good[3:]}")

    def test_secret_is_raw_utf8_bytes_not_base64(self):
        try:
            wrong_key = base64.b64decode(SECRET)
        except Exception:
            wrong_key = b"x"
        digest = hmac.new(wrong_key, f"m1.{self.ts}.".encode() + self.body, hashlib.sha256).digest()
        assert not self.check("v1," + base64.b64encode(digest).decode())

    def test_whsec_secret_is_decoded(self):
        whsec = "whsec_" + base64.b64encode(b"some key bytes").decode()
        assert self.check(sign("m1", self.ts, self.body, whsec), secret=whsec)

    def test_fails_closed_on_missing_or_empty_secret(self):
        assert not self.check(self.good, secret=None)
        assert not self.check(self.good, secret="")
        assert not self.check(self.good, secret="whsec_")

    @pytest.mark.parametrize("bad", ["0", "-5", "1.5", "01", "abc", "1e3", " 12"])
    def test_timestamp_must_be_plain_positive_integer(self, bad):
        assert not self.check(sign("m1", bad, self.body), ts=bad)

    def test_no_window_by_default_but_opt_in(self):
        old = str(int(time.time()) - 3600)
        sig = sign("m1", old, self.body)
        assert self.check(sig, ts=old)
        assert not self.check(sig, ts=old, tolerance=300)

    def test_bad_lengths_do_not_raise(self):
        assert not self.check("v1,short")
        assert not self.check("garbage")
