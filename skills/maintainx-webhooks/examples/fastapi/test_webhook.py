import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# MaintainX secrets are used as raw strings (no encoding/prefix)
SECRET = "test_maintainx_secret"
os.environ["MAINTAINX_WEBHOOK_SECRET"] = SECRET

from main import app, verify_maintainx_signature  # noqa: E402

client = TestClient(app)
HEADER = "x-maintainx-webhook-body-signature"
BASE = {"orgId": 321, "occurredAt": "2022-01-01T00:00:00.000Z"}

EVENTS = {
    "NEW_WORK_ORDER": {"eventType": "NEW_WORK_ORDER", "workOrderId": 123456, **BASE},
    "WORK_ORDER_CHANGE": {"eventType": "WORK_ORDER_CHANGE", "workOrderId": 123456, **BASE},
    "WORK_ORDER_STATUS_CHANGE": {
        "eventType": "WORK_ORDER_STATUS_CHANGE",
        "workOrderId": 123456,
        "oldStatus": "OPEN",
        "newStatus": "IN_PROGRESS",
        **BASE,
    },
    "NEW_WORK_REQUEST": {"eventType": "NEW_WORK_REQUEST", "workRequestId": 55, **BASE},
    "ASSET_STATUS_CHANGE": {
        "eventType": "ASSET_STATUS_CHANGE",
        "assetId": 42,
        "oldStatus": {"id": 1},
        "newStatus": {"id": 2},
        **BASE,
    },
}


def sign(body: bytes, secret: str = SECRET, timestamp: int | None = None) -> str:
    """Generate a real signature: HMAC-SHA256 hex of "{t}.{body}"."""
    ts = int(time.time()) if timestamp is None else timestamp
    v1 = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={ts},v1={v1}"


def post(body: bytes, header: str | None = None):
    headers = {"content-type": "application/json"}
    if header:
        headers[HEADER] = header
    return client.post("/webhooks/maintainx", content=body, headers=headers)


class TestValidSignatures:
    @pytest.mark.parametrize("name", list(EVENTS))
    def test_accepts_event(self, name):
        body = json.dumps(EVENTS[name]).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_unhandled_event(self):
        body = json.dumps({"eventType": "NEW_PART", "orgId": 321}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_ignores_unknown_signature_schemes(self):
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        assert post(body, f"{sign(body)},v2=deadbeef").status_code == 200


class TestInvalidRequests:
    def test_rejects_missing_header(self):
        assert post(json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()).status_code == 400

    def test_rejects_wrong_secret(self):
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        assert post(body, sign(body, "other_secret")).status_code == 400

    def test_rejects_tampered_body(self):
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        header = sign(body)
        tampered = json.dumps({**EVENTS["NEW_WORK_ORDER"], "workOrderId": 1}).encode()
        assert post(tampered, header).status_code == 400

    def test_rejects_malformed_header(self):
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        assert post(body, "garbage").status_code == 400

    def test_accepts_old_timestamp_by_default(self, monkeypatch):
        # Retries and replays keep the original timestamp, so the window is off by default
        monkeypatch.delenv("MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 3600
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        res = post(body, sign(body, timestamp=old))
        assert res.status_code == 200

    def test_rejects_old_timestamp_when_window_set(self, monkeypatch):
        monkeypatch.setenv("MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        res = post(body, sign(body, timestamp=old))
        assert res.status_code == 400

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        res = post(body, sign(body, timestamp=old))
        assert res.status_code == 200

    def test_rejects_non_numeric_timestamp(self):
        body = b"{}"
        assert post(body, "t=abc,v1=" + "0" * 64).status_code == 400

    def test_rejects_wrong_length_signature(self):
        body = json.dumps(EVENTS["NEW_WORK_ORDER"]).encode()
        assert post(body, f"t={int(time.time())},v1=abc").status_code == 400

    def test_rejects_validly_signed_non_json(self):
        body = b"not json"
        assert post(body, sign(body)).status_code == 400


class TestVerifyFunction:
    def test_tolerance_argument(self):
        body = b"{}"
        header = sign(body, timestamp=int(time.time()) - 100)
        assert verify_maintainx_signature(body, header, SECRET, tolerance=60) is False
        assert verify_maintainx_signature(body, header, SECRET, tolerance=300) is True


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
