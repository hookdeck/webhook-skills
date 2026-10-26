import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Semble's webhook secret is an opaque string used as-is; this one is only for tests
SECRET = "test_semble_secret_4d1e9b"
os.environ["SEMBLE_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def digest(body: str, timestamp: int, secret=SECRET) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={digest(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json", extra=None):
    headers = {"Content-Type": content_type, **(extra or {})}
    if signature is not None:
        # Encode as UTF-8 bytes so non-ASCII header values can be sent
        headers["X-Webhook-Signature"] = signature.encode("utf-8")
    return client.post("/webhooks/semble", content=body, headers=headers)


def event(event_type: str, identifiers=None) -> str:
    return json.dumps({
        "subscriptionId": "692597070fe21cfa5e6a010f",
        "eventId": "692597070fe21cfa5e6a010a",
        "eventType": event_type,
        "identifiers": identifiers or {},
    })


BOOKING_CREATED = event("booking.created", {
    "bookingId": "507f1f77bcf86cd799439011",
    "patientId": "507f191e810c19729de860ea",
    "doctorId": "507f1f77bcf86cd799439012",
})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(BOOKING_CREATED, sign(BOOKING_CREATED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(BOOKING_CREATED, sign(BOOKING_CREATED), "text/plain").status_code == 200

    def test_allows_space_after_comma(self):
        ts = int(time.time())
        assert post(BOOKING_CREATED, f"t={ts}, v1={digest(BOOKING_CREATED, ts)}").status_code == 200

    def test_accepts_when_any_v1_matches(self):
        ts = int(time.time())
        header = f"t={ts},v1={digest(BOOKING_CREATED, ts, 'old_secret')},v1={digest(BOOKING_CREATED, ts)}"
        assert post(BOOKING_CREATED, header).status_code == 200

    def test_accepts_uppercase_hex(self):
        ts = int(time.time())
        assert post(BOOKING_CREATED, f"t={ts},v1={digest(BOOKING_CREATED, ts).upper()}").status_code == 200

    def test_rejects_missing_header(self):
        assert post(BOOKING_CREATED).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(BOOKING_CREATED.replace("created", "deleted"), sign(BOOKING_CREATED)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(BOOKING_CREATED, sign(BOOKING_CREATED, secret="other_secret")).status_code == 400

    def test_rejects_when_every_v1_is_wrong(self):
        ts = int(time.time())
        header = f"t={ts},v1={digest(BOOKING_CREATED, ts, 'a')},v1={digest(BOOKING_CREATED, ts, 'b')}"
        assert post(BOOKING_CREATED, header).status_code == 400

    def test_rejects_wrong_length_or_non_hex_v1(self):
        ts = int(time.time())
        assert post(BOOKING_CREATED, f"t={ts},v1=abc").status_code == 400
        assert post(BOOKING_CREATED, f"t={ts},v1={'z' * 64}").status_code == 400

    def test_non_ascii_header_is_rejected_not_500(self):
        ts = int(time.time())
        assert post(BOOKING_CREATED, f"t={ts},v1={'é' * 64}").status_code == 400

    def test_rejects_header_without_t_or_v1(self):
        ts = int(time.time())
        assert post(BOOKING_CREATED, f"v1={digest(BOOKING_CREATED, ts)}").status_code == 400
        assert post(BOOKING_CREATED, f"t={ts}").status_code == 400
        assert post(BOOKING_CREATED, "garbage").status_code == 400
        assert post(BOOKING_CREATED, "t=abc,v1=deadbeef").status_code == 400

    def test_rejects_altered_timestamp(self):
        header = sign(BOOKING_CREATED, 1700000000).replace("t=1700000000", "t=1700000001")
        assert post(BOOKING_CREATED, header).status_code == 400

    def test_signs_with_t_from_signature_header(self):
        ts = int(time.time())
        res = post(BOOKING_CREATED, sign(BOOKING_CREATED, ts), extra={"X-Webhook-Timestamp": str(ts + 99)})
        assert res.status_code == 200

    def test_accepts_old_timestamp_by_default(self):
        old = int(time.time()) - 3600
        assert post(BOOKING_CREATED, sign(BOOKING_CREATED, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("SEMBLE_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(BOOKING_CREATED, sign(BOOKING_CREATED, old)).status_code == 400
        assert post(BOOKING_CREATED, sign(BOOKING_CREATED)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("SEMBLE_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(BOOKING_CREATED, sign(BOOKING_CREATED, old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize("event_type,identifiers", [
        ("booking.created", {"bookingId": "b1"}),
        ("booking.updated", {"bookingId": "b1"}),
        ("booking.deleted", {"bookingId": "b1"}),
        ("contact.created", {"contactId": "c1"}),
        ("invoice.paid", {"invoiceId": "i1", "paymentId": "p1"}),
        ("resourceAvailability.updated", {"resourceAvailabilityId": "ra1"}),
        ("patient.created", {"patientId": "p1"}),
    ])
    def test_dispatch(self, caplog, event_type, identifiers):
        body = event(event_type, identifiers)
        with caplog.at_level(logging.INFO, logger="semble-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        if event_type == "patient.created":
            assert "Unhandled event: patient.created" in caplog.text
        else:
            assert "Unhandled" not in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400
