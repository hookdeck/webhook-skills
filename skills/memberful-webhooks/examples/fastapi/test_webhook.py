import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
SECRET = "test_memberful_webhook_secret"
os.environ["MEMBERFUL_WEBHOOK_SECRET"] = SECRET

from main import app, verify_memberful_signature  # noqa: E402

client = TestClient(app)


def sample_payload(event="subscription.created", **extra):
    """The docs never show the payload; `event` at the top level is an assumption."""
    return {
        "event": event,
        "subscription": {"id": 1234, "autorenew": True},
        "member": {"id": 42, "email": "jane@example.com"},
        **extra,
    }


def sign(body, secret=SECRET):
    """Real signature, same as Memberful: lowercase hex HMAC-SHA256 of the raw body, nothing else."""
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
        headers["X-Memberful-Webhook-Signature"] = sig
    return client.request(method, "/webhooks/memberful", content=raw, headers=headers)


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
        assert send("POST", BODY.replace("jane", "evil"), signature=sign(BODY)).status_code == 401

    def test_verifies_exact_bytes(self):
        pretty = json.dumps(sample_payload(), indent=2)
        assert send("POST", pretty, signature=sign(BODY)).status_code == 401

    def test_verifies_non_ascii_bytes_and_trailing_newline(self):
        raw = json.dumps(sample_payload("member_signup", member={"id": 1, "full_name": "Zoë"}), ensure_ascii=False) + "\n"
        assert send("POST", raw.encode("utf-8")).status_code == 200

    def test_secret_is_used_as_utf8_bytes(self):
        raw = b"{}"
        assert verify_memberful_signature(raw, sign(raw, "deadbeef"), "deadbeef") is True
        assert verify_memberful_signature(raw, sign(raw, "deadbeef"), "deadbeee") is False

    def test_rejects_everything_without_a_secret(self):
        assert verify_memberful_signature(b"{}", sign(b"{}", "x"), "") is False


class TestMethodsAndBodies:
    @pytest.mark.parametrize("method", ["GET", "PUT", "PATCH", "DELETE"])
    def test_non_post_is_405(self, method):
        assert send(method, BODY).status_code == 405

    @pytest.mark.parametrize("content_type", ["text/plain", "application/octet-stream"])
    def test_accepts_any_content_type(self, content_type):
        assert send("POST", BODY, content_type=content_type).status_code == 200

    def test_signed_body_that_is_not_json_is_400(self):
        assert send("POST", "not json").status_code == 400

    def test_signed_empty_body_is_400(self):
        assert send("POST", None).status_code == 400

    @pytest.mark.parametrize("raw", ["[]", '"text"', "42", "null"])
    def test_signed_non_object_json_is_400(self, raw):
        assert send("POST", raw).status_code == 400


EVENTS = [
    "member_signup", "member_updated", "member.deleted", "tax_id.updated", "custom_fields.updated",
    "subscription.created", "subscription.updated", "subscription.renewed", "subscription.activated",
    "subscription.reactivated", "subscription.deactivated", "subscription.deleted",
    "order.purchased", "order.refunded", "order.suspended", "order.completed",
    "subscription_plan.created", "subscription_plan.updated", "subscription_plan.deleted",
    "download.created", "download.updated", "download.deleted",
]


class TestEvents:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_documented_event(self, event, capsys):
        res = send("POST", json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_logs_and_acknowledges_unknown_event(self, capsys):
        res = send("POST", json.dumps(sample_payload("something.else")))
        assert res.status_code == 200
        assert "Unhandled event: something.else" in capsys.readouterr().out

    def test_payload_without_top_level_event_is_logged_not_rejected(self, capsys):
        res = send("POST", json.dumps({"type": "subscription.created"}))
        assert res.status_code == 200
        assert "Unhandled event: None" in capsys.readouterr().out

    @pytest.mark.parametrize(
        "payload",
        [
            {"event": "member_signup", "member": "oops"},
            {"event": "subscription.created", "subscription": [1, 2]},
            {"event": "order.purchased", "order": None},
            {"event": "subscription.updated", "subscription": {"id": {}}},
            {"event": "subscription.updated", "subscription": {"id": True}},
            {"event": 5},
        ],
    )
    def test_wrong_typed_fields_do_not_cause_a_500(self, payload):
        assert send("POST", json.dumps(payload)).status_code == 200
