import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

# LoyaltyLion secrets are opaque strings (OAuth client secret or site secret): used as UTF-8 bytes
SECRET = "test_loyaltylion_secret_abc123"
HEADER = "x-loyaltylion-hmac-sha256"
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("LOYALTYLION_WEBHOOK_SECRET", SECRET)


def sign(body, secret=SECRET) -> str:
    if isinstance(body, str):
        body = body.encode()
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


CUSTOMER = {
    "id": 6932,
    "merchant_id": "2134606599",
    "email": "jessica@example.com",
    "points_approved": 200,
    "points_pending": 300,
    "enrolled": True,
}


def envelope(topic, payload):
    return {
        "id": "bff1bddb-6cd8-4c2c-9619-18744657053c",
        "topic": topic,
        "created_at": "2025-01-01T03:00:05.000Z",
        "payload": payload,
    }


EVENTS = {
    "program_events/customer.enrolled": envelope(
        "program_events/customer.enrolled",
        {"properties": {"customer": CUSTOMER, "enrollment": {"date": "2025-01-01T02:55:00.000Z", "trigger": "account_creation"}}},
    ),
    "program_events/customer.points_earned": envelope(
        "program_events/customer.points_earned",
        {"properties": {"customer": CUSTOMER, "transaction": {"id": "5432", "points_approved": "1200"}}},
    ),
    "program_events/customer.claimed_reward": envelope(
        "program_events/customer.claimed_reward",
        {"properties": {"title": "$5 voucher", "customer": CUSTOMER, "reward_type": "voucher", "voucher_code": "LL-PQ8V63"}},
    ),
    # Docs example: customer sits at the top level, not under payload
    "customers/update": {
        "id": "bff1bddb-6cd8-4c2c-9619-18744657053c",
        "topic": "customers/update",
        "created_at": "2025-01-01T03:00:05.000Z",
        "customer": CUSTOMER,
    },
    "loyalty_emails/unsubscribe": envelope(
        "loyalty_emails/unsubscribe", {"unsubscribe": {"customer": {"id": 6936, "email": "sarah@example.com"}}}
    ),
    "receipts/manual_approval_required": envelope(
        "receipts/manual_approval_required",
        {"customer": CUSTOMER, "receipt": {"id": 42, "status": "awaiting_manual_review"}, "rule": {"id": 1234, "name": "$retail_purchase"}},
    ),
    # No envelope and no topic: posted to a custom reward's fulfilment URL
    "rewards/store_fulfilment": {
        "test": False,
        "reward_fulfilment_id": 1823,
        "reward_id": 6,
        "reward_identifier": "surprise-gift-next-order",
        "customer_id": 5,
        "customer_merchant_id": "2075071365",
        "customer_email": "jesca.blue@example.com",
    },
}


def post(raw, headers=None, content_type="application/json"):
    if isinstance(raw, str):
        raw = raw.encode()
    return client.post(
        "/webhooks/loyaltylion",
        content=raw,
        headers={"content-type": content_type, **(headers or {})},
    )


class TestValidSignatures:
    @pytest.mark.parametrize("topic", list(EVENTS))
    def test_accepts_event(self, topic):
        raw = json.dumps(EVENTS[topic])
        res = post(raw, {HEADER: sign(raw)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_dispatches_on_topic(self, capsys):
        raw = json.dumps(EVENTS["program_events/customer.enrolled"])
        post(raw, {HEADER: sign(raw)})
        assert "Customer 6932 enrolled in the loyalty program" in capsys.readouterr().out

    def test_recognises_topicless_store_fulfilment(self, capsys):
        raw = json.dumps(EVENTS["rewards/store_fulfilment"])
        post(raw, {HEADER: sign(raw)})
        assert "Fulfilment 1823 for reward surprise-gift-next-order" in capsys.readouterr().out

    def test_logs_unknown_topics_and_returns_200(self, capsys):
        raw = json.dumps(envelope("program_events/customer.moved_to_loyal_segment", {"properties": {"customer": CUSTOMER}}))
        res = post(raw, {HEADER: sign(raw)})
        assert res.status_code == 200
        assert "Unhandled LoyaltyLion topic: program_events/customer.moved_to_loyal_segment" in capsys.readouterr().out

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        raw = json.dumps(EVENTS["customers/update"], indent=2)  # pretty-printed
        assert post(raw, {HEADER: sign(raw)}, "text/plain").status_code == 200


class TestInvalidSignatures:
    raw = json.dumps(EVENTS["customers/update"])

    def test_missing_header(self):
        assert post(self.raw).status_code == 401

    def test_empty_header(self):
        assert post(self.raw, {HEADER: ""}).status_code == 401

    def test_wrong_secret(self):
        assert post(self.raw, {HEADER: sign(self.raw, "wrong_secret")}).status_code == 401

    def test_tampered_body(self):
        assert post(self.raw.replace("6932", "9999"), {HEADER: sign(self.raw)}).status_code == 401

    def test_reserialised_body(self):
        pretty = json.dumps(json.loads(self.raw), indent=2)
        assert post(pretty, {HEADER: sign(self.raw)}).status_code == 401

    def test_hex_digest(self):
        digest = hmac.new(SECRET.encode(), self.raw.encode(), hashlib.sha256).hexdigest()
        assert post(self.raw, {HEADER: digest}).status_code == 401

    def test_prefixed_or_unpadded(self):
        sig = sign(self.raw)
        assert post(self.raw, {HEADER: f"sha256={sig}"}).status_code == 401
        assert post(self.raw, {HEADER: sig[:-1]}).status_code == 401

    def test_stray_low_bits_in_last_character(self):
        sig = sign(self.raw)
        # The 43rd char carries 4 data bits + 2 unused bits: flipping the lowest bit decodes to
        # the same bytes but is a different string, and must be rejected.
        twin = sig[:42] + ALPHABET[ALPHABET.index(sig[42]) ^ 1] + "="
        assert base64.b64decode(twin) == base64.b64decode(sig)
        assert twin != sig
        assert post(self.raw, {HEADER: twin}).status_code == 401

    def test_case_changed_signature(self):
        assert post(self.raw, {HEADER: sign(self.raw).lower()}).status_code == 401


class TestRequestHandling:
    def test_not_json(self):
        raw = "not json"
        assert post(raw, {HEADER: sign(raw)}).status_code == 400

    def test_json_array(self):
        raw = "[]"
        assert post(raw, {HEADER: sign(raw)}).status_code == 400

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("LOYALTYLION_WEBHOOK_SECRET")
        raw = "{}"
        assert post(raw, {HEADER: sign(raw)}).status_code == 500

    def test_only_post(self):
        assert client.get("/webhooks/loyaltylion").status_code == 405


class TestVerifyFunction:
    body = b'{"a":1}'

    def test_accepts_correct_signature(self):
        assert main.verify_loyaltylion_signature(self.body, sign(self.body), SECRET)

    def test_rejects_missing_and_empty(self):
        assert not main.verify_loyaltylion_signature(self.body, None, SECRET)
        assert not main.verify_loyaltylion_signature(self.body, "", SECRET)

    def test_rejects_non_ascii_signature(self):
        assert not main.verify_loyaltylion_signature(self.body, "é" * 44, SECRET)

    def test_rejects_without_secret(self):
        assert not main.verify_loyaltylion_signature(self.body, sign(self.body), None)
