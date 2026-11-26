# Generated with: worldpay-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import uuid
from unittest import mock

import pytest
from fastapi.testclient import TestClient

import main
from main import (
    KNOWN_EVENTS,
    WORLDPAY_EVENTS,
    app,
    parse_event_signature,
    process_event,
    verify_worldpay_signature,
)

# Synthetic shared secrets. Real ones come from your Worldpay Implementation
# Manager over a secure channel. keyId 1 is the current key; keyId 2 is the
# renewed key Worldpay also signs with during a renewal.
SECRET_1 = "test-worldpay-shared-secret-key-1"
SECRET_2 = "test-worldpay-shared-secret-key-2"
CONTENT_TYPE = "application/vnd.worldpay.events-v1.hal+json"

client = TestClient(app)


def make_event(classification="payment", event_type="sentForAuthorization"):
    # Envelope from the Access Worldpay events OpenAPI spec (sentForAuthorization example).
    return {
        "eventId": str(uuid.uuid4()),
        "eventTimestamp": "2018-06-13T14:18:13.407",
        "eventDetails": {
            "classification": classification,
            "downstreamReference": "3378792436",
            "transactionReference": "Memory265-13/08/1876",
            "type": event_type,
            "date": "2018-06-13",
            "amount": {"value": 100, "currencyCode": "EUR"},
            "_links": {
                "payments:events": {
                    "href": "https://try.access.worldpay.com/payments/events/eyJrIjoiazNhYjYzMiJ9"
                }
            },
        },
    }


def make_body(**kwargs) -> bytes:
    return json.dumps(make_event(**kwargs), separators=(",", ":")).encode()


def hmac_hex(body: bytes, secret: str = SECRET_1) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def sig(body: bytes, key_id: str = "1", secret: str = SECRET_1) -> str:
    return f"{key_id}/SHA256/{hmac_hex(body, secret)}"


_UNSET = object()


def post(body: bytes, signature=_UNSET):
    headers = {"Content-Type": CONTENT_TYPE}
    if signature is not None:
        headers["Event-Signature"] = sig(body) if signature is _UNSET else signature
    return client.post("/webhooks/worldpay", content=body, headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("WORLDPAY_WEBHOOK_SECRET_1", SECRET_1)
    monkeypatch.delenv("WORLDPAY_WEBHOOK_SECRET_2", raising=False)
    main.seen_event_ids.clear()


@pytest.fixture
def processed(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "process_event", lambda event: calls.append(event))
    return calls


ONE = {"1": SECRET_1}
BOTH = {"1": SECRET_1, "2": SECRET_2}


class TestParseEventSignature:
    def test_comma_separated_with_whitespace(self):
        assert parse_event_signature("1/SHA256/aaa, 2/SHA256/bbb") == [
            ("1", "SHA256", "aaa"),
            ("2", "SHA256", "bbb"),
        ]

    def test_skips_malformed_entries(self):
        assert parse_event_signature("garbage,1/SHA256,1/SHA256/a/b,//,,3/SHA256/ccc") == [
            ("3", "SHA256", "ccc")
        ]


class TestVerifyWorldpaySignature:
    body = make_body()

    def test_accepts_hex_hmac_sha256_in_either_case(self):
        assert verify_worldpay_signature(self.body, sig(self.body), ONE)
        assert verify_worldpay_signature(self.body, f"1/SHA256/{hmac_hex(self.body).upper()}", ONE)

    def test_rejects_base64_and_bare_digest(self):
        b64 = base64.b64encode(hmac.new(SECRET_1.encode(), self.body, hashlib.sha256).digest()).decode()
        assert not verify_worldpay_signature(self.body, f"1/SHA256/{b64}", ONE)
        assert not verify_worldpay_signature(self.body, hmac_hex(self.body), ONE)

    def test_rejects_signature_over_reserialised_json(self):
        pretty = json.dumps(json.loads(self.body), indent=2).encode()
        assert not verify_worldpay_signature(self.body, sig(pretty), ONE)

    def test_accepts_either_order_during_key_renewal(self):
        header = f"{sig(self.body, '1', SECRET_1)},{sig(self.body, '2', SECRET_2)}"
        reversed_header = f"{sig(self.body, '2', SECRET_2)},{sig(self.body, '1', SECRET_1)}"
        assert verify_worldpay_signature(self.body, header, BOTH)
        assert verify_worldpay_signature(self.body, reversed_header, BOTH)
        assert verify_worldpay_signature(self.body, reversed_header, ONE)

    def test_selects_secret_by_key_id(self):
        assert not verify_worldpay_signature(self.body, f"2/SHA256/{hmac_hex(self.body, SECRET_1)}", BOTH)
        assert not verify_worldpay_signature(self.body, sig(self.body, "7"), ONE)

    def test_skips_unsupported_hash_function(self):
        sha512 = hmac.new(SECRET_1.encode(), self.body, hashlib.sha512).hexdigest()
        assert not verify_worldpay_signature(self.body, f"1/SHA512/{sha512}", ONE)

    def test_truncated_signature_is_false_not_error(self):
        assert not verify_worldpay_signature(self.body, f"1/SHA256/{hmac_hex(self.body)[:20]}", ONE)

    def test_hashes_once_per_key_for_repeated_entries(self):
        header = ",".join(["1/SHA256/00"] * 500)
        with mock.patch("main.hmac.new", wraps=hmac.new) as spy:
            assert not verify_worldpay_signature(self.body, header, ONE)
        assert spy.call_count == 1

    def test_missing_header(self):
        assert not verify_worldpay_signature(self.body, None, ONE)


class TestWebhookEndpoint:
    def test_valid_signature_with_vendor_content_type(self, processed):
        body = make_body()
        res = post(body)
        assert res.status_code == 200
        assert res.json() == {
            "received": True,
            "eventId": json.loads(body)["eventId"],
            "classification": "payment",
            "type": "sentForAuthorization",
        }
        assert len(processed) == 1
        assert processed[0]["eventDetails"]["amount"] == {"value": 100, "currencyCode": "EUR"}

    def test_verifies_raw_bytes_of_pretty_printed_body(self, processed):
        body = json.dumps(make_event(), indent=2).encode()
        assert post(body).status_code == 200

    def test_renewal_delivery_with_two_signatures(self, monkeypatch, processed):
        monkeypatch.setenv("WORLDPAY_WEBHOOK_SECRET_2", SECRET_2)
        body = make_body()
        res = post(body, signature=f"{sig(body, '2', SECRET_2)},{sig(body, '1', SECRET_1)}")
        assert res.status_code == 200

    def test_every_documented_event_pair(self, processed):
        assert len(KNOWN_EVENTS) == 26
        for classification, types in WORLDPAY_EVENTS.items():
            for event_type in types:
                res = post(make_body(classification=classification, event_type=event_type))
                assert res.status_code == 200
                assert res.json()["classification"] == classification
                assert res.json()["type"] == event_type
        assert len(processed) == 26

    def test_missing_signature_is_400_not_401(self, processed):
        res = post(make_body(), signature=None)
        assert res.status_code == 400
        assert res.json()["error"] == "Missing Event-Signature header"

    def test_signature_mismatch_is_400_not_401(self, processed):
        body = make_body()
        res = post(body, signature=sig(body, "1", "wrong-secret"))
        assert res.status_code == 400
        assert res.json()["error"] == "Invalid signature"
        assert processed == []

    def test_tampered_body_and_malformed_header(self, processed):
        body = make_body()
        tampered = body.replace(b'"value":100', b'"value":1')
        assert post(tampered, signature=sig(body)).status_code == 400
        assert post(body, signature="not-a-signature").status_code == 400

    def test_fails_closed_without_secret(self, monkeypatch, processed):
        monkeypatch.delenv("WORLDPAY_WEBHOOK_SECRET_1")
        assert post(make_body()).status_code == 500
        assert processed == []

    def test_invalid_json_or_non_event_after_valid_signature(self, processed):
        assert post(b'{"truncated": ').status_code == 400
        assert post(b'{"hello":"world"}').status_code == 400
        assert post(b"[1,2,3]").status_code == 400

    def test_dedupes_on_event_id(self, processed):
        body = make_body()
        post(body)
        res = post(body)
        assert res.status_code == 200
        assert res.json()["duplicate"] is True
        assert len(processed) == 1

    def test_unknown_pair_is_acknowledged_not_processed(self, processed):
        res = post(make_body(classification="payout", event_type="sentForAuthorization"))
        assert res.status_code == 200
        assert res.json()["ignored"] == "unknown event"
        assert processed == []


class TestProcessEvent:
    def test_payment_and_payout_refused_route_differently(self):
        payment = process_event(make_event("payment", "refused"))
        payout = process_event(make_event("payout", "refused"))
        assert payment["action"] == "payment did not complete"
        assert payout["action"] == "payout refused"

    def test_payout_without_downstream_reference_or_links(self):
        summary = process_event(
            {
                "eventId": "e1",
                "eventTimestamp": "2018-06-13T14:18:13.407",
                "eventDetails": {
                    "classification": "payout",
                    "transactionReference": "payout-ref-1",
                    "type": "disbursed",
                    "date": "2018-06-13",
                    "amount": {"value": 250, "currencyCode": "GBP"},
                },
            }
        )
        assert summary["action"] == "payout progressing"
        assert summary["amount"] == 250
        assert summary["downstreamReference"] is None
