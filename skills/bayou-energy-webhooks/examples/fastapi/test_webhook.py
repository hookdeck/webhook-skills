# Generated with: bayou-energy-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import pytest

# Bayou secrets look like "whsec_" + base64(key bytes), for example
# "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw". The HMAC key is the decoded part.
SECRET = "whsec_" + base64.b64encode(b"bayou-test-signing-key-0123456789").decode()

os.environ["BAYOU_ENERGY_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Bayou does (Standard Webhooks)."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = msg_id or f"wh_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/bayou-energy", content=raw_body, headers=headers)


def bill() -> dict:
    return {
        "id": 12345,
        "external_id": "BILL_123",
        "status": "unlocked",
        "customer_id": 123456,
        "customer_external_id": "MSCOTT123",
        "utility": "con_edison",
        "total_amount": 12000,
    }


def new_bill() -> str:
    return json.dumps({"event": "new_bill", "object": bill()})


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("BAYOU_ENERGY_WEBHOOK_SECRET", SECRET)


class TestTestVector:
    def test_reproduces_docs_signature(self):
        body = '{"event": "bills_ready", "object": {"id": 123456}}'
        sig = sign(body, "wh_12345", "1750000000", "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw")
        assert sig == "v1,yW3priuFZD+w+ji8R847LYfQxOKmZlBAHEt7OQP0CMI="


class TestValidSignatures:
    def test_new_bill(self, caplog):
        caplog.set_level(logging.INFO)
        body = new_bill()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "New bill 12345" in caplog.text

    def test_updated_bill(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps({"event": "updated_bill", "object": bill()})
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Updated bill 12345" in caplog.text

    def test_bills_ready(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(
            {"event": "bills_ready", "object": {"id": 12345, "external_id": "MSCOTT123", "bills_parsed": [bill()]}}
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "1 parsed" in caplog.text

    def test_intervals_ready(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(
            {
                "event": "intervals_ready",
                "object": {
                    "id": 12345,
                    "external_id": "MSCOTT123",
                    "first_interval_discovered": "2022-07-01T00:00:00Z",
                    "last_interval_discovered": "2022-07-31T00:00:00Z",
                    "available_data": {"account_numbers": []},
                },
            }
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Intervals ready" in caplog.text

    def test_customer_has_filled_credentials(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(
            {
                "event": "customer_has_filled_credentials",
                "object": {"id": 12345, "external_id": "MSCOTT123", "utility": "con_edison", "has_filled_credentials": True},
            }
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "con_edison" in caplog.text

    def test_new_unparsed_bill(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(
            {
                "event": "new_unparsed_bill",
                "object": {"id": 12345, "external_id": "BILL_123", "status": "unparsed", "customer_id": 12345},
            }
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "unparsed bill 12345" in caplog.text

    def test_customer_must_reauthenticate(self, caplog):
        caplog.set_level(logging.INFO)
        body = json.dumps(
            {
                "event": "customer_must_reauthenticate",
                "object": {"id": 12345, "external_id": "MSCOTT123", "reason": "mfa_factor_has_expired"},
            }
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "mfa_factor_has_expired" in caplog.text

    def test_unknown_event_is_acknowledged(self):
        body = json.dumps({"event": "something_new", "object": {}})
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_non_json_content_type_is_verified_on_raw_body(self):
        body = new_bill()
        headers = {**signed_headers(body), "content-type": "text/plain"}
        res = post(body, headers)
        assert res.status_code == 200

    def test_any_matching_signature_in_list_is_accepted(self):
        body = new_bill()
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        res = post(body, headers)
        assert res.status_code == 200

    def test_retried_delivery_is_deduplicated(self):
        body = new_bill()
        msg_id = f"wh_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        res = post(new_bill(), {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = new_bill()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_signature_from_another_secret(self):
        other = "whsec_" + base64.b64encode(b"another-company-secret-0123456").decode()
        body = new_bill()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = new_bill()
        headers = signed_headers(body)
        res = post(body.replace("12000", "99999"), headers)
        assert res.status_code == 400

    def test_timestamp_outside_tolerance(self):
        body = new_bill()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_is_rejected(self):
        body = new_bill()
        msg_id, ts = "wh_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        res = post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("BAYOU_ENERGY_WEBHOOK_SECRET", raising=False)
        body = new_bill()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
