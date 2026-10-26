import base64
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

# Box signature keys are opaque strings from the Developer Console; this one is only for tests
SECRET = "test_box_primary_key_Zk3v9QpL2mWx"
os.environ["BOX_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("BOX_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("BOX_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def stamp(when=None) -> str:
    """Box's RFC 3339 timestamp format"""
    when = when or datetime.now(timezone.utc)
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Body first, then the timestamp header, no separator"""
    signed = b"".join([body, timestamp.encode("latin-1")])
    return base64.b64encode(hmac.new(secret.encode(), signed, hashlib.sha256).digest()).decode()


def event(trigger: str, **source) -> bytes:
    """Shaped like Box's documented FILE.UPLOADED sample"""
    return json.dumps(
        {
            "type": "webhook_event",
            "id": "eb0c4e06-751f-442c-86f8-fd5bb404dbec",
            "created_at": "2016-07-11T10:10:32-07:00",
            "trigger": trigger,
            "webhook": {"id": "53", "type": "webhook"},
            "created_by": {"type": "user", "id": "226067247", "name": "John Q. Developer", "login": "johnq@dev.name"},
            "source": {"id": "73835521473", "type": "file", "name": "Test-Image-3.png", **source},
            "additional_info": [],
        }
    ).encode()


_UNSET = object()


def deliver(body: bytes, method="POST", timestamp=_UNSET, signature=_UNSET, headers=None, content_type="application/json"):
    ts = stamp() if timestamp is _UNSET else timestamp
    sig = sign(body, ts or "") if signature is _UNSET else signature
    h = {"Content-Type": content_type, **(headers or {})}
    if sig is not None:
        h["BOX-SIGNATURE-PRIMARY"] = sig
    if ts is not None:
        h["BOX-DELIVERY-TIMESTAMP"] = ts
    return client.request(method, "/webhooks/box", content=body or None, headers=h)


class TestVerification:
    def test_accepts_valid_signature(self):
        res = deliver(event("FILE.UPLOADED"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_exact_bytes_not_reserialised_json(self):
        body = b'{ "type" : "webhook_event",\n  "trigger":"FILE.DOWNLOADED", "id":"x", "source":{"id":"1"} }'
        assert deliver(body).status_code == 200

    def test_accepts_any_content_type(self):
        assert deliver(event("FILE.UPLOADED"), content_type="text/plain").status_code == 200

    def test_rejects_signature_without_timestamp(self):
        body = event("FILE.UPLOADED")
        body_only = base64.b64encode(hmac.new(SECRET.encode(), body, hashlib.sha256).digest()).decode()
        assert deliver(body, signature=body_only).status_code == 401

    def test_rejects_timestamp_before_body(self):
        body = event("FILE.UPLOADED")
        ts = stamp()
        swapped = base64.b64encode(hmac.new(SECRET.encode(), ts.encode() + body, hashlib.sha256).digest()).decode()
        assert deliver(body, timestamp=ts, signature=swapped).status_code == 401

    def test_rejects_other_key(self):
        body = event("FILE.UPLOADED")
        ts = stamp()
        assert deliver(body, timestamp=ts, signature=sign(body, ts, "other_key")).status_code == 401

    def test_rejects_tampered_body(self):
        body = event("FILE.UPLOADED")
        ts = stamp()
        tampered = body.replace(b"Test-Image-3", b"Evil")
        assert deliver(tampered, timestamp=ts, signature=sign(body, ts)).status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = event("FILE.UPLOADED")
        res = deliver(body, timestamp=stamp(), signature=sign(body, "2016-07-11T10:10:32-07:00"))
        assert res.status_code == 401

    def test_rejects_missing_signature(self):
        assert deliver(event("FILE.UPLOADED"), signature=None).status_code == 401

    def test_rejects_missing_timestamp(self):
        body = event("FILE.UPLOADED")
        assert deliver(body, timestamp=None, signature=sign(body, "")).status_code == 401

    def test_rejects_empty_signature(self):
        assert deliver(event("FILE.UPLOADED"), signature="").status_code == 401

    def test_rejects_malformed_signatures(self):
        body = event("FILE.UPLOADED")
        ts = stamp()
        good = sign(body, ts)
        for bad in [
            good[:-1],  # too short
            good + "A",  # too long
            good[:42] + "==",  # pad in the wrong place
            "*" + good[1:],  # outside the alphabet
            "-" + good[1:],  # url-safe alphabet
            "_" + good[1:],
            "sha256=" + good,  # prefix
            f"{good}, {good}",  # list
        ]:
            assert deliver(body, timestamp=ts, signature=bad).status_code == 401, bad

    def test_compares_base64_case_sensitively(self):
        body = event("FILE.UPLOADED")
        ts = stamp()
        good = sign(body, ts)
        flipped = re.sub(r"[A-Za-z]", lambda m: m.group().swapcase(), good, count=1)
        assert deliver(body, timestamp=ts, signature=flipped).status_code == 401

    def test_ignores_secondary_signature(self):
        body = event("FILE.UPLOADED")
        ts = stamp()
        res = deliver(body, timestamp=ts, signature=None, headers={"BOX-SIGNATURE-SECONDARY": sign(body, ts)})
        assert res.status_code == 401

    def test_returns_500_without_secret(self, monkeypatch):
        monkeypatch.delenv("BOX_WEBHOOK_SECRET")
        assert deliver(event("FILE.UPLOADED")).status_code == 500

    def test_returns_400_for_signed_non_json(self):
        assert deliver(b"not json").status_code == 400


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_verifies_and_accepts_method_with_body(self, method):
        assert deliver(event("FILE.UPLOADED"), method=method).status_code == 200

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE", "GET"])
    def test_rejects_unsigned_method(self, method):
        assert client.request(method, "/webhooks/box").status_code == 401

    def test_get_without_body_is_empty_bytes(self):
        # Signature over just the timestamp is valid; an empty body is acknowledged
        assert deliver(b"", method="GET").status_code == 200


class TestTolerance:
    @staticmethod
    def old() -> str:
        return stamp(datetime.now(timezone.utc) - timedelta(hours=1))

    def test_old_timestamp_accepted_by_default(self):
        assert deliver(event("FILE.UPLOADED"), timestamp=self.old()).status_code == 200

    def test_old_timestamp_accepted_when_zero(self, monkeypatch):
        monkeypatch.setenv("BOX_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert deliver(event("FILE.UPLOADED"), timestamp=self.old()).status_code == 200

    def test_old_timestamp_rejected_when_set(self, monkeypatch):
        monkeypatch.setenv("BOX_WEBHOOK_TOLERANCE_SECONDS", "600")
        assert deliver(event("FILE.UPLOADED"), timestamp=self.old()).status_code == 401

    def test_recent_timestamp_accepted_when_set(self, monkeypatch):
        monkeypatch.setenv("BOX_WEBHOOK_TOLERANCE_SECONDS", "600")
        assert deliver(event("FILE.UPLOADED")).status_code == 200

    def test_offset_timestamp_accepted_when_set(self, monkeypatch):
        monkeypatch.setenv("BOX_WEBHOOK_TOLERANCE_SECONDS", "600")
        local = datetime.now(timezone(timedelta(hours=-7))).strftime("%Y-%m-%dT%H:%M:%S-07:00")
        assert deliver(event("FILE.UPLOADED"), timestamp=local).status_code == 200

    def test_unparseable_timestamp_rejected_when_set(self, monkeypatch):
        monkeypatch.setenv("BOX_WEBHOOK_TOLERANCE_SECONDS", "600")
        assert deliver(event("FILE.UPLOADED"), timestamp="yesterday").status_code == 401


@pytest.mark.parametrize(
    "trigger,type_",
    [
        ("FILE.UPLOADED", "file"),
        ("FILE.DOWNLOADED", "file"),
        ("FILE.TRASHED", "file"),
        ("FOLDER.CREATED", "folder"),
        ("COMMENT.CREATED", "comment"),
        ("COLLABORATION.CREATED", "collaboration"),
        ("SIGN_REQUEST.COMPLETED", "sign_request"),
        ("FILE.PREVIEWED", "file"),
    ],
)
def test_handles_trigger(trigger, type_):
    assert deliver(event(trigger, type=type_)).status_code == 200
