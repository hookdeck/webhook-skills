# Generated with: checkout-com-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Checkout.com FastAPI webhook receiver.

Signatures here are generated with the same algorithm Checkout.com uses:
HMAC-SHA256 over the RAW body, keyed with the signature key used AS-IS as a
UTF-8 string, hex-encoded (Base16). No prefix, no timestamp, no version tag.
"""

import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Checkout.com signature keys are arbitrary UTF-8 strings used AS-IS as the
# HMAC key. This is the shape used in Checkout.com's own SDK tests.
SIGNATURE_KEY = "8V8x0dLK%AyD*DNS8JJr"

os.environ["CHECKOUT_WEBHOOK_SIGNATURE_KEY"] = SIGNATURE_KEY
os.environ.pop("CHECKOUT_WEBHOOK_AUTHORIZATION_KEY", None)

from main import (  # noqa: E402
    app,
    format_amount,
    verify_authorization_key,
    verify_cko_signature,
)

client = TestClient(app, raise_server_exceptions=False)


def generate_signature(raw_body: bytes, key: str = SIGNATURE_KEY) -> str:
    """Generate a Cko-Signature exactly as Checkout.com does."""
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    return hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


# The documented payment_approved envelope, trimmed from Checkout.com's documented example.
PAYMENT_APPROVED = {
    "id": "evt_caxmnvuvbe4elkbdx2imwbnjxu",
    "type": "payment_approved",
    "version": "1.0.29",
    "created_on": "2023-05-22T11:56:04.8821546Z",
    "data": {
        "id": "pay_griq7wyqkggu7mnk7ecm6ysrl4",
        "action_id": "act_gl5cpqgccxeulozrvaassd4lta",
        "reference": "ORD-5023-4E89",
        "amount": 20,
        "currency": "USD",
        "response_code": "10000",
        "response_summary": "Approved",
        "metadata": {"coupon_code": "NY2018"},
    },
    "_links": {
        "self": {
            "href": "https://api.checkout.com/workflows/events/evt_caxmnvuvbe4elkbdx2imwbnjxu"
        }
    },
}

# payment_captured uses `timestamp`, NOT `created_on` -- the field name really
# does vary by event in Checkout.com's own documented examples.
PAYMENT_CAPTURED = {
    "id": "evt_2ifvgjxdzcuevoqdmsbybjfhtm",
    "type": "payment_captured",
    "version": "1.0.29",
    "timestamp": "2023-05-22T12:02:11.1234567Z",
    "data": {
        "id": "pay_griq7wyqkggu7mnk7ecm6ysrl4",
        "action_id": "act_x6sbfnzkhcpezjqrbwqaa7cdwe",
        "amount": 20,
        "currency": "USD",
        "response_code": "10000",
        "response_summary": "Approved",
    },
}

DISPUTE_RECEIVED = {
    "id": "evt_lbyzcfnm3wtuxnwqbdo2xqfpwm",
    "type": "dispute_received",
    "version": "1.0.29",
    "created_on": "2023-06-01T09:14:33.4820000Z",
    "data": {
        "id": "dsp_vgy3kkv2qqgurmkzqj5d3lzwya",
        "payment_id": "pay_griq7wyqkggu7mnk7ecm6ysrl4",
        "amount": 20,
        "currency": "USD",
        "reason_code": "10.4",
    },
}


@pytest.fixture(autouse=True)
def reset_env():
    """Each test starts with the signature key set and no Authorization key."""
    os.environ["CHECKOUT_WEBHOOK_SIGNATURE_KEY"] = SIGNATURE_KEY
    os.environ.pop("CHECKOUT_WEBHOOK_AUTHORIZATION_KEY", None)
    yield
    os.environ["CHECKOUT_WEBHOOK_SIGNATURE_KEY"] = SIGNATURE_KEY
    os.environ.pop("CHECKOUT_WEBHOOK_AUTHORIZATION_KEY", None)


def post(raw_body, signature="auto", authorization=None):
    """POST a raw body with an optional Cko-Signature / Authorization header.

    Header values may be ``bytes`` to put exact non-ASCII bytes on the wire --
    Starlette decodes incoming headers as latin-1.
    """
    if not isinstance(raw_body, (bytes, str)):
        raw_body = json.dumps(raw_body)
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")

    headers = {"Content-Type": "application/json"}
    if signature == "auto":
        signature = generate_signature(raw_body)
    if signature is not None:
        headers["Cko-Signature"] = signature
    if authorization is not None:
        headers["Authorization"] = authorization

    return client.post("/webhooks/checkout-com", content=raw_body, headers=headers)


class TestCkoSignatureVerification:
    def test_accepts_a_valid_signature(self):
        res = post(PAYMENT_APPROVED)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_a_tampered_body_with_the_original_signature(self):
        original = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        signature = generate_signature(original)
        tampered = dict(PAYMENT_APPROVED)
        tampered["data"] = dict(PAYMENT_APPROVED["data"], amount=9999999)

        res = post(tampered, signature=signature)
        assert res.status_code == 401
        assert res.json() == {"error": "Invalid signature"}

    def test_rejects_a_signature_made_with_the_wrong_key(self):
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        res = post(body, signature=generate_signature(body, "not-the-right-key"))
        assert res.status_code == 401

    def test_rejects_a_missing_signature_header(self):
        res = post(PAYMENT_APPROVED, signature=None)
        assert res.status_code == 401
        assert res.json() == {"error": "Missing Cko-Signature header"}

    def test_rejects_a_garbage_signature_without_raising(self):
        # compare_digest tolerates unequal lengths, unlike Node's
        # crypto.timingSafeEqual -- this asserts we still return 401, not 500.
        res = post(PAYMENT_APPROVED, signature="nope")
        assert res.status_code == 401

    def test_rejects_a_non_ascii_signature_without_raising(self):
        # compare_digest raises TypeError on str arguments containing
        # non-ASCII characters, and Starlette decodes headers as latin-1 --
        # so a signature byte above 0x7F must still be a 401, never a 500.
        res = post(PAYMENT_APPROVED, signature=b"abc\xe9def")
        assert res.status_code == 401

    def test_accepts_an_uppercase_hex_signature(self):
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        res = post(body, signature=generate_signature(body).upper())
        assert res.status_code == 200

    def test_tolerates_surrounding_whitespace(self):
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        res = post(body, signature=f"  {generate_signature(body)}  ")
        assert res.status_code == 200

    def test_rejects_a_sha256_prefixed_signature(self):
        # Checkout.com sends a BARE hex digest -- no `sha256=` prefix.
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        res = post(body, signature=f"sha256={generate_signature(body)}")
        assert res.status_code == 401

    def test_rejects_a_base64_digest(self):
        # Checkout.com uses HEX (Base16), not base64.
        import base64

        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        digest = hmac.new(SIGNATURE_KEY.encode("utf-8"), body, hashlib.sha256).digest()
        res = post(body, signature=base64.b64encode(digest).decode("ascii"))
        assert res.status_code == 401

    def test_verifies_raw_bytes_not_a_reserialized_body(self):
        # Semantically identical to PAYMENT_APPROVED but formatted differently.
        # A handler that re-serialized before hashing would compute a different
        # digest and reject this.
        pretty = json.dumps(PAYMENT_APPROVED, indent=2).encode("utf-8")
        res = post(pretty, signature=generate_signature(pretty))
        assert res.status_code == 200

    def test_verifies_a_body_with_special_characters(self):
        # Checkout.com warns that re-serializing can mangle (c), (R), (TM).
        payload = dict(PAYMENT_APPROVED)
        payload["data"] = dict(
            PAYMENT_APPROVED["data"], reference="Acme© Ltd® — Widget™"
        )
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        res = post(body, signature=generate_signature(body))
        assert res.status_code == 200

    def test_returns_400_for_a_verified_but_unparseable_body(self):
        body = b"not json at all"
        res = post(body, signature=generate_signature(body))
        assert res.status_code == 400
        assert res.json() == {"error": "Invalid JSON"}


class TestAuthorizationKey:
    def test_is_skipped_when_no_key_is_configured(self):
        res = post(PAYMENT_APPROVED)
        assert res.status_code == 200

    def test_accepts_the_configured_key_verbatim(self):
        os.environ["CHECKOUT_WEBHOOK_AUTHORIZATION_KEY"] = "secret-key"
        res = post(PAYMENT_APPROVED, authorization="secret-key")
        assert res.status_code == 200

    def test_rejects_a_wrong_key_even_with_a_valid_signature(self):
        os.environ["CHECKOUT_WEBHOOK_AUTHORIZATION_KEY"] = "secret-key"
        res = post(PAYMENT_APPROVED, authorization="wrong-key")
        assert res.status_code == 401
        assert res.json() == {"error": "Invalid Authorization key"}

    def test_rejects_a_missing_header_when_a_key_is_configured(self):
        os.environ["CHECKOUT_WEBHOOK_AUTHORIZATION_KEY"] = "secret-key"
        res = post(PAYMENT_APPROVED)
        assert res.status_code == 401

    def test_a_non_ascii_key_mismatch_is_a_401_not_a_500(self):
        # The key is an arbitrary UTF-8 string. compare_digest raises
        # TypeError on str arguments containing non-ASCII characters, so a
        # non-ASCII key must not turn a mismatch into an unhandled 500 --
        # Checkout.com would then retry it eight times over ~30 hours.
        os.environ["CHECKOUT_WEBHOOK_AUTHORIZATION_KEY"] = "s\u00e9cret-key"
        res = post(PAYMENT_APPROVED, authorization=b"s\xe8cret-key")
        assert res.status_code == 401
        assert res.json() == {"error": "Invalid Authorization key"}

    def test_rejects_a_bearer_prefixed_value(self):
        # Checkout.com adds NO "Bearer " prefix -- the key arrives verbatim.
        os.environ["CHECKOUT_WEBHOOK_AUTHORIZATION_KEY"] = "secret-key"
        res = post(PAYMENT_APPROVED, authorization="Bearer secret-key")
        assert res.status_code == 401


class TestFailClosed:
    def test_returns_500_when_the_signature_key_is_unset(self):
        os.environ.pop("CHECKOUT_WEBHOOK_SIGNATURE_KEY", None)
        res = post(PAYMENT_APPROVED, signature="anything")
        assert res.status_code == 500
        assert res.json() == {"error": "Webhook signature key not configured"}


class TestEventHandling:
    def test_handles_payment_captured_which_carries_timestamp(self):
        res = post(PAYMENT_CAPTURED)
        assert res.status_code == 200
        # The field name varies by event -- this one has no created_on.
        assert "created_on" not in PAYMENT_CAPTURED
        occurred_at = PAYMENT_CAPTURED.get("created_on") or PAYMENT_CAPTURED.get("timestamp")
        assert occurred_at == "2023-05-22T12:02:11.1234567Z"

    def test_handles_dispute_received(self):
        res = post(DISPUTE_RECEIVED)
        assert res.status_code == 200
        # data.id is the DISPUTE; data.payment_id is the payment.
        assert DISPUTE_RECEIVED["data"]["id"].startswith("dsp_")
        assert DISPUTE_RECEIVED["data"]["payment_id"].startswith("pay_")

    def test_acknowledges_an_unknown_event_type(self):
        res = post(
            {
                "id": "evt_unknownunknownunknownunknow",
                "type": "not_a_real_event_type",
                "version": "1.0.29",
                "created_on": "2023-05-22T11:56:04.8821546Z",
                "data": {"id": "crd_abc"},
            }
        )
        assert res.status_code == 200


class TestVerifyCkoSignatureUnit:
    def test_returns_true_for_a_matching_signature(self):
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        assert verify_cko_signature(body, generate_signature(body), SIGNATURE_KEY) is True

    def test_returns_false_when_the_key_is_none(self):
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        assert verify_cko_signature(body, generate_signature(body), None) is False

    def test_returns_false_when_the_header_is_none(self):
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        assert verify_cko_signature(body, None, SIGNATURE_KEY) is False

    def test_returns_false_for_a_non_ascii_header_without_raising(self):
        # compare_digest raises TypeError on non-ASCII str arguments; a junk
        # signature must be a plain False (-> 401), never an exception.
        body = json.dumps(PAYMENT_APPROVED).encode("utf-8")
        assert verify_cko_signature(body, "abc\u00e9def", SIGNATURE_KEY) is False
        assert verify_cko_signature(body, "s\u00e9cret", "k\u00e9y") is False

    def test_uses_the_key_as_is(self):
        # Base64-decoding the key before hashing produces a different digest.
        import base64

        body = b"{}"
        correct = generate_signature(body)
        decoded_key = base64.b64decode(SIGNATURE_KEY + "==", validate=False)
        wrong = hmac.new(decoded_key, body, hashlib.sha256).hexdigest()
        assert correct != wrong

    def test_produces_a_64_character_lowercase_hex_digest(self):
        sig = generate_signature(b"{}")
        assert len(sig) == 64
        assert sig == sig.lower()
        int(sig, 16)  # raises if not hex


class TestVerifyAuthorizationKeyUnit:
    def test_returns_true_when_no_key_is_configured(self):
        assert verify_authorization_key(None, None) is True
        assert verify_authorization_key("anything", "") is True

    def test_compares_the_whole_value(self):
        assert verify_authorization_key("secret-key", "secret-key") is True
        assert verify_authorization_key("secret-key-extra", "secret-key") is False

    def test_handles_a_non_ascii_key_without_raising(self):
        # compare_digest raises TypeError on non-ASCII str arguments, so both
        # sides are encoded before comparison. An operator is free to set
        # CHECKOUT_WEBHOOK_AUTHORIZATION_KEY to any UTF-8 string.
        assert verify_authorization_key("s\u00e9cret-key", "s\u00e9cret-key") is True
        assert verify_authorization_key("s\u00e8cret-key", "s\u00e9cret-key") is False
        assert verify_authorization_key("secret-key", "s\u00e9cret-key") is False
        assert verify_authorization_key(None, "secret-key") is False


class TestFormatAmount:
    def test_treats_amount_as_the_minor_currency_unit(self):
        # The documented example: amount 20, currency USD, is $0.20 -- not $20.
        assert format_amount(20, "USD") == "0.20 USD"
        assert format_amount(1999, "GBP") == "19.99 GBP"

    def test_handles_a_missing_amount(self):
        assert format_amount(None, "USD") == "n/a"


class TestHealth:
    def test_health_returns_ok(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
