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

# Bayou secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
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


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, prefix="webhook"):
    msg_id = msg_id or f"wh_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": "application/json",
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/bayou-energy", content=raw_body, headers=headers)


def bill(event: str) -> dict:
    return {
        "event": event,
        "object": {
            "id": 12345,
            "external_id": "BILL_123",
            "status": "unlocked",
            "customer_id": 123456,
            "customer_external_id": "MSCOTT123",
            "utility": "con_edison",
            "total_amount": 12000,
            "meters": [],
        },
    }


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("BAYOU_ENERGY_WEBHOOK_SECRET", SECRET)


class TestSigningAlgorithm:
    def test_reproduces_documented_test_vector(self):
        body = '{"event": "bills_ready", "object": {"id": 123456}}'
        assert (
            sign(body, "wh_12345", "1750000000", "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw")
            == "v1,yW3priuFZD+w+ji8R847LYfQxOKmZlBAHEt7OQP0CMI="
        )


class TestValidSignatures:
    @pytest.mark.parametrize("name", ["new_bill", "updated_bill"])
    def test_accepts_bill_events(self, name, caplog):
        body = json.dumps(bill(name))
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert f"{name}: bill 12345" in caplog.text

    def test_accepts_bills_ready(self, caplog):
        body = json.dumps(
            {"event": "bills_ready", "object": {"id": 12345, "external_id": "MSCOTT123", "bills_parsed": [bill("new_bill")["object"]]}}
        )
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "1 bills" in caplog.text

    def test_accepts_intervals_ready(self):
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
        assert post(body, signed_headers(body)).status_code == 200

    def test_accepts_customer_has_filled_credentials(self, caplog):
        body = json.dumps(
            {
                "event": "customer_has_filled_credentials",
                "object": {"id": 12345, "utility": "con_edison", "has_filled_credentials": True},
            }
        )
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "shared con_edison credentials" in caplog.text

    def test_accepts_new_unparsed_bill_without_logging_file_url(self, caplog):
        body = json.dumps(
            {
                "event": "new_unparsed_bill",
                "object": {
                    "id": 12345,
                    "status": "unparsed",
                    "customer_id": 12345,
                    "utility": "con_edison",
                    "file_url": "https://x/y.pdf?X-Amz-Signature=abc",
                },
            }
        )
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "X-Amz" not in caplog.text

    def test_accepts_customer_must_reauthenticate(self, caplog):
        body = json.dumps(
            {
                "event": "customer_must_reauthenticate",
                "object": {"id": 12345, "reason": "mfa_factor_has_expired", "onboarding_token": "secret-token"},
            }
        )
        with caplog.at_level(logging.INFO):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "mfa_factor_has_expired" in caplog.text
        assert "secret-token" not in caplog.text

    def test_acknowledges_unknown_event_types(self):
        body = json.dumps({"event": "something_new", "object": {}})
        assert post(body, signed_headers(body)).status_code == 200

    def test_verifies_raw_bytes_whatever_the_content_type(self):
        body = '{ "event" :"bills_ready",\n "object":{"id":1} }'
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_accepts_any_one_of_several_signatures(self):
        body = json.dumps(bill("new_bill"))
        headers = signed_headers(body)
        headers["webhook-signature"] = f"v1,bm90LXRoZS1yaWdodC1zaWc= {headers['webhook-signature']}"
        assert post(body, headers).status_code == 200

    def test_accepts_svix_prefixed_headers(self):
        body = json.dumps(bill("new_bill"))
        assert post(body, signed_headers(body, prefix="svix")).status_code == 200

    def test_duplicate_webhook_id_is_acknowledged(self):
        body = json.dumps(bill("new_bill"))
        msg_id = f"wh_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        body = json.dumps(bill("new_bill"))
        assert post(body, {"content-type": "application/json"}).status_code == 400

    def test_bad_signature(self):
        body = json.dumps(bill("new_bill"))
        assert post(body, signed_headers(body, signature="v1,aW52YWxpZA==")).status_code == 400

    def test_other_secret(self):
        other = "whsec_" + base64.b64encode(b"another-company-secret-01234567").decode()
        body = json.dumps(bill("new_bill"))
        assert post(body, signed_headers(body, secret=other)).status_code == 400

    def test_unknown_signature_version(self):
        body = json.dumps(bill("new_bill"))
        headers = signed_headers(body)
        headers["webhook-signature"] = headers["webhook-signature"].replace("v1,", "v2,", 1)
        assert post(body, headers).status_code == 400

    def test_tampered_body(self):
        body = json.dumps(bill("new_bill"))
        headers = signed_headers(body)
        assert post(body.replace("12000", "1"), headers).status_code == 400

    def test_timestamp_outside_window(self):
        body = json.dumps(bill("new_bill"))
        assert post(body, signed_headers(body, timestamp=now() - 600)).status_code == 400

    def test_non_numeric_timestamp(self):
        body = json.dumps(bill("new_bill"))
        assert post(body, signed_headers(body, timestamp="yesterday")).status_code == 400


class TestFailClosed:
    def test_500_when_secret_unset(self, monkeypatch):
        monkeypatch.delenv("BAYOU_ENERGY_WEBHOOK_SECRET", raising=False)
        body = json.dumps(bill("new_bill"))
        assert post(body, signed_headers(body)).status_code == 500
