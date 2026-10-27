import hashlib
import hmac
import json
import os
import time

import pytest

# BambooHR webhook private key (used as a plain UTF-8 string)
SECRET = "37b26dc8cf1f08435fd0d08779268d77"
os.environ["BAMBOOHR_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

timestamp = str(int(time.time()))
payload = json.dumps(
    {
        "employees": [
            {
                "id": "40351",
                "action": "Updated",
                "timestamp": "2025-08-18T21:38:50Z",
                "changedFields": ["Employee #"],
                "fields": {"Employee #": "9", "First Name": "Robert"},
            },
            {"id": "40546", "action": "Created", "timestamp": "2025-08-19T21:38:50Z", "changedFields": [], "fields": {}},
            {"id": "40547", "action": "Deleted", "timestamp": "2025-08-19T21:39:50Z", "changedFields": [], "fields": {}},
        ]
    }
)


def sign(body: str, ts: str, secret: str = SECRET) -> str:
    # BambooHR signature: hex HMAC-SHA256 of body + timestamp header value (no separator)
    message = body.encode() + ts.encode("latin-1")
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def post(body: str, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/bamboohr", content=body, headers=all_headers)


def valid_headers(body: str = payload, ts: str = timestamp):
    return {"X-BambooHR-Signature": sign(body, ts), "X-BambooHR-Timestamp": ts}


EVENT_BASED = [
    {"type": "employee.created", "timestamp": "2025-02-18T15:30:00Z", "data": {"companyId": "12345", "employeeId": "100"}},
    {
        "type": "employee.updated",
        "timestamp": "2026-01-31T18:42:00+0000",
        "data": {"companyId": "12345", "employeeId": "67890", "changedFields": ["firstName"]},
    },
    {"type": "employee.deleted", "timestamp": "2025-02-18T15:30:00Z", "data": {"companyId": "12345", "employeeId": "100"}},
    {"type": "company.updated", "timestamp": "2025-02-18T15:30:00Z", "data": {"companyId": "12345"}},
    {"type": "company.deleted", "timestamp": "2025-02-18T15:30:00Z", "data": {"companyId": "12345"}},
    {"type": "company-integrations.updated", "timestamp": "2025-02-18T15:30:00Z", "data": {"companyId": "12345"}},
    {"type": "some.future_event", "timestamp": "2025-02-18T15:30:00Z", "data": {}},
]


class TestEventBased:
    @pytest.mark.parametrize("event", EVENT_BASED, ids=[e["type"] for e in EVENT_BASED])
    def test_accepts_signed_event_based_payload(self, event):
        body = json.dumps(event)
        res = post(body, valid_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_event_based_payload_with_bad_signature(self):
        body = json.dumps(EVENT_BASED[0])
        headers = {"X-BambooHR-Signature": sign(body, timestamp, "wrong_secret"), "X-BambooHR-Timestamp": timestamp}
        assert post(body, headers).status_code == 401


class TestSignature:
    def test_accepts_valid_signature_batched_employees(self):
        res = post(payload, valid_headers())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        headers = valid_headers()
        headers["X-BambooHR-Signature"] = headers["X-BambooHR-Signature"].upper()
        assert post(payload, headers).status_code == 200

    def test_accepts_signed_form_encoded_body(self):
        form = "employees%5B40351%5D%5Baction%5D=Updated&employees%5B40351%5D%5Btimestamp%5D=2025-08-18T21%3A38%3A50Z"
        res = post(form, valid_headers(form), "application/x-www-form-urlencoded")
        assert res.status_code == 200

    def test_rejects_wrong_secret(self):
        headers = {"X-BambooHR-Signature": sign(payload, timestamp, "wrong_secret"), "X-BambooHR-Timestamp": timestamp}
        assert post(payload, headers).status_code == 401

    def test_rejects_signature_without_timestamp(self):
        body_only = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        headers = {"X-BambooHR-Signature": body_only, "X-BambooHR-Timestamp": timestamp}
        assert post(payload, headers).status_code == 401

    def test_rejects_timestamp_before_body(self):
        swapped = hmac.new(SECRET.encode(), (timestamp + payload).encode(), hashlib.sha256).hexdigest()
        headers = {"X-BambooHR-Signature": swapped, "X-BambooHR-Timestamp": timestamp}
        assert post(payload, headers).status_code == 401

    def test_rejects_different_timestamp_than_signed(self):
        headers = {"X-BambooHR-Signature": sign(payload, timestamp), "X-BambooHR-Timestamp": str(int(timestamp) + 1)}
        assert post(payload, headers).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(payload, {"X-BambooHR-Timestamp": timestamp}).status_code == 401

    def test_rejects_missing_timestamp(self):
        assert post(payload, {"X-BambooHR-Signature": sign(payload, timestamp)}).status_code == 401

    def test_rejects_malformed_signature(self):
        for bad in ["abc", "z" * 64, sign(payload, timestamp) + "00"]:
            headers = {"X-BambooHR-Signature": bad, "X-BambooHR-Timestamp": timestamp}
            assert post(payload, headers).status_code == 401

    def test_rejects_modified_body(self):
        modified = payload.replace("40351", "40352")
        assert post(modified, valid_headers(payload)).status_code == 401

    def test_rejects_signed_invalid_json_with_400(self):
        assert post("not json", valid_headers("not json")).status_code == 400


class TestTimestampTolerance:
    OLD = "1500000000"

    def test_does_not_reject_old_timestamps_by_default(self):
        assert post(payload, valid_headers(payload, self.OLD)).status_code == 200

    def test_rejects_old_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(payload, valid_headers(payload, self.OLD)).status_code == 401

    def test_accepts_fresh_timestamp_when_enabled(self, monkeypatch):
        monkeypatch.setenv("BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(payload, valid_headers()).status_code == 200
