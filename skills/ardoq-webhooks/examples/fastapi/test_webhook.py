import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["ARDOQ_WEBHOOK_SECRET"] = "test_ardoq_signing_secret"
os.environ.pop("ARDOQ_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, handle_ardoq_event, verify_ardoq_signature  # noqa: E402

client = TestClient(app)

SECRET = os.environ["ARDOQ_WEBHOOK_SECRET"]


def digest(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Ardoq's digest: HMAC-SHA256(secret, "<timestamp>.<raw body>"), hex.

    Built from bytes, like the verifier, so non-UTF-8 bodies sign correctly.
    """
    signed_content = b"".join([timestamp.encode("latin-1"), b".", body])
    return hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()


def now_seconds() -> str:
    return str(int(time.time()))


def sign(body: bytes, timestamp: str | None = None, secret: str = SECRET) -> dict:
    timestamp = timestamp or now_seconds()
    return {
        "x-ardoq-signature-256": f"sha256={digest(body, timestamp, secret)}",
        "x-ardoq-timestamp": timestamp,
    }


# Documented sample payload (Ardoq help article, "Request Format")
TAG_EVENT = {
    "resource-type": "tag",
    "resource-id": "cf73fa1e257fdb6a576540e9",
    "event-type": "create",
    "organization": "a8574eb78e6293348cae2d0f",
    "organization-label": "usertesting",
    "data": {
        "description": "",
        "_id": "cf73fa1e257fdb6a576540e9",
        "name": "Test-tag",
        "components": ["e0a1be808bc264be4ed3fd2c"],
        "references": [],
        "_version": 1,
        "ardoq": {"entity-type": "tag"},
    },
}

# Component and reference payloads share the envelope; their `data` is trimmed
COMPONENT_EVENT = {
    **TAG_EVENT,
    "resource-type": "component",
    "resource-id": "e0a1be808bc264be4ed3fd2c",
    "data": {"_id": "e0a1be808bc264be4ed3fd2c", "name": "Billing API", "ardoq": {"entity-type": "component"}},
}
REFERENCE_EVENT = {
    **TAG_EVENT,
    "resource-type": "reference",
    "resource-id": "a1b2c3d4e5f60718293a4b5c",
    "data": {"_id": "a1b2c3d4e5f60718293a4b5c", "ardoq": {"entity-type": "reference"}},
}


def post(body: bytes, headers: dict, content_type: str = "application/json"):
    return client.post(
        "/webhooks/ardoq",
        content=body,
        headers={"content-type": content_type, **headers},
    )


class TestVerifyArdoqSignature:
    body = json.dumps(TAG_EVENT).encode()
    ts = "1729162486"
    good = digest(body, ts)

    def verify(self, sig, ts=None, body=None, secret=SECRET, tolerance=0):
        return verify_ardoq_signature(
            self.body if body is None else body,
            sig,
            self.ts if ts is None else ts,
            secret,
            tolerance,
        )

    def test_accepts_prefixed_digest(self):
        assert self.verify(f"sha256={self.good}")

    def test_accepts_bare_digest(self):
        assert self.verify(self.good)

    def test_accepts_uppercase_hex(self):
        assert self.verify(f"sha256={self.good.upper()}")

    def test_rejects_missing_or_empty_inputs(self):
        assert not self.verify(None)
        assert not self.verify("")
        assert not verify_ardoq_signature(self.body, f"sha256={self.good}", None, SECRET, 0)
        assert not verify_ardoq_signature(self.body, f"sha256={self.good}", "", SECRET, 0)
        assert not verify_ardoq_signature(self.body, f"sha256={self.good}", self.ts, None, 0)

    def test_rejects_wrong_secret_tampered_body_or_timestamp(self):
        assert not self.verify(f"sha256={self.good}", secret="other_secret")
        assert not self.verify(f"sha256={self.good}", body=b"{}")
        assert not self.verify(f"sha256={self.good}", ts="1729162487")

    def test_does_not_trim_timestamp(self):
        assert not self.verify(f"sha256={self.good}", ts=f"{self.ts} ")

    @pytest.mark.parametrize(
        "sig",
        [
            "sha256=" + good[:62],
            "sha256=" + good + "00",
            "sha256=zz" + good[2:],  # 64 characters, but not all hex
            "sha1=" + good,
            "sha256=",
            "sha256=" + good + "\n",  # trailing newline must not slip past the format check
        ],
    )
    def test_rejects_malformed_digest(self, sig):
        assert not self.verify(sig)

    def test_verifies_exact_bytes_including_non_utf8(self):
        raw = b'{"a":"\xff\xfe"}'
        assert verify_ardoq_signature(raw, f"sha256={digest(raw, self.ts)}", self.ts, SECRET, 0)

    def test_old_timestamps_accepted_by_default(self):
        assert verify_ardoq_signature(self.body, f"sha256={self.good}", self.ts, SECRET)

    def test_tolerance_rejects_stale_timestamp(self):
        old = str(int(time.time()) - 3600)
        sig = f"sha256={digest(self.body, old)}"
        assert not self.verify(sig, ts=old, tolerance=300)
        assert self.verify(sig, ts=old, tolerance=7200)

    def test_tolerance_accepts_fresh_and_rejects_non_numeric(self):
        now = now_seconds()
        assert self.verify(f"sha256={digest(self.body, now)}", ts=now, tolerance=300)
        assert not self.verify(f"sha256={digest(self.body, 'abc')}", ts="abc", tolerance=300)

    def test_tolerance_from_env(self, monkeypatch):
        old = str(int(time.time()) - 3600)
        sig = f"sha256={digest(self.body, old)}"
        monkeypatch.setenv("ARDOQ_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert not verify_ardoq_signature(self.body, sig, old, SECRET)


class TestHandleArdoqEvent:
    def test_dispatches_component_reference_and_tag(self):
        assert handle_ardoq_event(COMPONENT_EVENT) == "component:create"
        assert handle_ardoq_event(REFERENCE_EVENT) == "reference:create"
        assert handle_ardoq_event(TAG_EVENT) == "tag:create"

    def test_unknown_resource_type_is_unhandled(self):
        assert (
            handle_ardoq_event({"resource-type": "dashboard", "event-type": "update"})
            == "unhandled:dashboard"
        )


class TestWebhookEndpoint:
    @pytest.mark.parametrize("event", [TAG_EVENT, COMPONENT_EVENT, REFERENCE_EVENT])
    def test_signed_event_returns_200(self, event):
        body = json.dumps(event).encode()
        assert post(body, sign(body)).status_code == 200

    def test_unhandled_resource_type_returns_200(self):
        body = json.dumps({**TAG_EVENT, "resource-type": "dashboard"}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_verifies_bytes_whatever_the_content_type(self):
        body = json.dumps(TAG_EVENT).encode()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_rejects_reserialized_body(self):
        original = json.dumps(TAG_EVENT).encode()
        pretty = json.dumps(TAG_EVENT, indent=2).encode()
        assert post(pretty, sign(original)).status_code == 401

    def test_missing_signature_returns_401(self):
        body = json.dumps(TAG_EVENT).encode()
        assert post(body, {"x-ardoq-timestamp": now_seconds()}).status_code == 401

    def test_missing_timestamp_returns_401(self):
        body = json.dumps(TAG_EVENT).encode()
        headers = {"x-ardoq-signature-256": sign(body)["x-ardoq-signature-256"]}
        assert post(body, headers).status_code == 401

    def test_wrong_secret_returns_401(self):
        body = json.dumps(TAG_EVENT).encode()
        assert post(body, sign(body, secret="wrong_secret")).status_code == 401

    def test_malformed_signature_returns_401(self):
        body = json.dumps(TAG_EVENT).encode()
        headers = {"x-ardoq-signature-256": "sha256=not-a-digest", "x-ardoq-timestamp": now_seconds()}
        assert post(body, headers).status_code == 401

    def test_signed_non_json_returns_400(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400

    def test_signed_non_object_returns_400(self):
        body = b"[1,2]"
        assert post(body, sign(body)).status_code == 400


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
