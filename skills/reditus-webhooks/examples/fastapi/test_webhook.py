import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
SECRET = "test_reditus_webhook_secret"
os.environ["REDITUS_WEBHOOK_SECRET"] = SECRET

from main import app, verify_reditus_signature  # noqa: E402

client = TestClient(app)


def sample_payload(event_type="partnership.accepted", data=None):
    """Shaped like the partnership.accepted example in Reditus's docs."""
    return {
        "event_type": event_type,
        "url": "destination-url@example.com",
        "created_at": "2024-05-05",
        "data": data
        if data is not None
        else {
            "affiliate_name": "Acme",
            "affiliate_email": "john@acme.com",
            "affiliate_first_name": "John",
            "affiliate_last_name": "Doe",
            "accepted_at": "2024-05-05",
        },
    }


def sign(body, secret=SECRET):
    """Real signature, same as Reditus: lowercase hex HMAC-SHA256 of the raw body, nothing else."""
    if isinstance(body, str):
        body = body.encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def send(method, body, signature="auto", content_type="application/json"):
    raw = body.encode() if isinstance(body, str) else body
    headers = {}
    if raw is not None:
        headers["Content-Type"] = content_type
    sig = sign(raw or b"") if signature == "auto" else signature
    if sig is not None:
        headers["X-Signature"] = sig
    return client.request(method, "/webhooks/reditus", content=raw, headers=headers)


BODY = json.dumps(sample_payload())


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = send("POST", BODY)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        assert send("POST", BODY, signature=sign(BODY).upper()).status_code == 200

    def test_rejects_missing_signature(self):
        assert send("POST", BODY, signature=None).status_code == 401

    def test_rejects_empty_signature(self):
        assert send("POST", BODY, signature="").status_code == 401

    def test_rejects_wrong_signature_of_right_shape(self):
        assert send("POST", BODY, signature="a" * 64).status_code == 401

    def test_rejects_signature_from_another_secret(self):
        assert send("POST", BODY, signature=sign(BODY, "other")).status_code == 401

    def test_rejects_short_signature(self):
        assert send("POST", BODY, signature=sign(BODY)[:62]).status_code == 401

    def test_rejects_long_signature(self):
        assert send("POST", BODY, signature=sign(BODY) + "ab").status_code == 401

    def test_rejects_non_hex_signature_of_right_length(self):
        assert send("POST", BODY, signature="z" * 64).status_code == 401

    def test_rejects_prefixed_signature(self):
        assert send("POST", BODY, signature=f"sha256={sign(BODY)}").status_code == 401

    def test_rejects_body_changed_after_signing(self):
        assert send("POST", BODY.replace("Acme", "Evil"), signature=sign(BODY)).status_code == 401

    def test_verifies_exact_bytes(self):
        pretty = json.dumps(sample_payload(), indent=2)
        assert send("POST", pretty, signature=sign(BODY)).status_code == 401

    def test_verifies_non_ascii_bytes_and_trailing_newline(self):
        raw = json.dumps(sample_payload("lead.created", {"lead_email": "zoë@example.com"}), ensure_ascii=False) + "\n"
        assert send("POST", raw.encode("utf-8")).status_code == 200

    def test_secret_is_used_as_utf8_bytes(self):
        raw = b"{}"
        assert verify_reditus_signature(raw, sign(raw, "deadbeef"), "deadbeef") is True
        assert verify_reditus_signature(raw, sign(raw, "deadbeef"), "deadbeee") is False

    def test_rejects_everything_without_a_secret(self):
        assert verify_reditus_signature(b"{}", sign(b"{}", "x"), "") is False


class TestMethodsAndBodies:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_signed_request_with_body(self, method):
        assert send(method, BODY).status_code == 200

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE", "GET"])
    def test_rejects_unsigned_request(self, method):
        body = None if method == "GET" else BODY
        assert send(method, body, signature=None).status_code == 401

    def test_get_without_body_is_verified_over_zero_bytes(self):
        res = send("GET", None)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_get_without_body_and_wrong_signature_is_rejected(self):
        assert send("GET", None, signature="a" * 64).status_code == 401

    @pytest.mark.parametrize("content_type", ["text/plain", "application/octet-stream"])
    def test_accepts_any_content_type(self, content_type):
        assert send("POST", BODY, content_type=content_type).status_code == 200

    def test_signed_body_that_is_not_json_is_400(self):
        assert send("POST", "not json").status_code == 400

    @pytest.mark.parametrize("raw", ["[]", '"text"', "42", "null"])
    def test_signed_non_object_json_is_400(self, raw):
        assert send("POST", raw).status_code == 400


EVENTS = {
    "partnership.accepted": {"affiliate_name": "Acme", "affiliate_email": "john@acme.com"},
    "referral.created": {"affiliate_email": "a@example.com", "referral_id": "6412-smga-1314-munw", "referral_uid": "r1", "referral_email": "john@example.com"},
    "advocate.created": {"advocate_uid": "u1", "advocate_id": "6412-smga-1314-munw", "advocate_slug": "jwe512", "advocate_email": "john@example.com"},
    "lead.created": {"advocate_uid": "u1", "lead_id": "6412-smga-1314-munw", "lead_uid": "l1", "lead_email": "john@example.com"},
    "reward.created": {"amount": 5521, "currency": "usd", "advocate_uid": "u1", "lead_id": "l1", "reward_id": "9182-agja-1891-awia", "custom_text": "Awesome Hoodie"},
}


class TestEvents:
    @pytest.mark.parametrize("event_type", list(EVENTS))
    def test_handles_documented_event(self, event_type, capsys):
        res = send("POST", json.dumps(sample_payload(event_type, EVENTS[event_type])))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_logs_and_acknowledges_unknown_event(self, capsys):
        res = send("POST", json.dumps(sample_payload("something.else", {})))
        assert res.status_code == 200
        assert "Unhandled event: something.else" in capsys.readouterr().out

    @pytest.mark.parametrize(
        "payload",
        [
            {"event_type": "lead.created", "data": "oops"},
            {"event_type": "reward.created", "data": [1, 2]},
            {"event_type": "referral.created", "data": None},
            {"event_type": "reward.created", "data": {"amount": "55", "currency": 7, "reward_id": {}}},
            {"event_type": "reward.created", "data": {"amount": True}},
            {"event_type": 5, "data": {}},
            {"data": {}},
        ],
    )
    def test_wrong_typed_fields_do_not_cause_a_500(self, payload):
        assert send("POST", json.dumps(payload)).status_code == 200
