# Generated with: mailersend-webhooks skill
# https://github.com/hookdeck/webhook-skills

"""Tests for the MailerSend webhook receiver.

Signatures are generated with MailerSend's exact algorithm:
lowercase hex HMAC-SHA256 of the RAW body, keyed with the signing secret.
No timestamp, no nonce, no prefix — the body alone.
"""

import hashlib
import hmac
import json
import os
import uuid
from datetime import timezone

import pytest

SECRET = "test_signing_secret_value"
# Must be in the environment before main.py is imported.
os.environ["MAILERSEND_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import (  # noqa: E402
    MAILERSEND_TEST_SECRET,
    app,
    normalize_meta,
    parse_created_at,
    verify_signature,
)

client = TestClient(app)


def sign(raw_body: bytes, secret: str = SECRET) -> str:
    """Sign a payload the way MailerSend does: hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def post(raw_body: bytes, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["Signature"] = signature
    return client.post("/webhooks/mailersend", content=raw_body, headers=headers)


def activity_event(event_type: str = "activity.sent", event_id: str = None) -> bytes:
    """A realistic activity event, verbatim envelope from the MailerSend docs."""
    return json.dumps(
        {
            "type": event_type,
            "created_at": "2025-08-05T21:23:54.000000Z",
            "data": {
                "id": event_id or str(uuid.uuid4()),
                "domain_id": "yv69oxl5kl785kw2",
                "message_id": "6892766ae78995a317577aa1",
                "email_id": "6892766a8d52ba62543d5e71",
                "type": event_type.replace("activity.", ""),
                "subject": "Test email",
                "recipient": "test@mailersend.com",
                "tags": ["test", "test2"],
                # MailerSend sends an empty ARRAY when there is nothing to report
                "meta": [],
            },
        }
    ).encode("utf-8")


# The URL-validation ping. Note: `message`, NOT `data`.
TEST_PING = json.dumps(
    {
        "type": "webhook.test",
        "message": "This is a ping test message",
        "created_at": "2026-03-27T07:24:20.577080Z",
    }
).encode("utf-8")


# === Signature verification ================================================


def test_accepts_a_correctly_signed_event():
    body = activity_event("activity.delivered")
    res = post(body, sign(body))

    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_rejects_a_signature_computed_with_the_wrong_secret():
    body = activity_event()
    res = post(body, sign(body, "the_wrong_secret"))

    assert res.status_code == 401
    assert res.json() == {"error": "Invalid signature"}


def test_rejects_a_tampered_body():
    """The signature covers the raw bytes, so any edit invalidates it."""
    body = activity_event()
    signature = sign(body)
    tampered = body.replace(b"test@mailersend.com", b"attacker@example.com")

    assert post(tampered, signature).status_code == 401


def test_rejects_a_body_that_is_only_reserialised():
    """Semantically identical, byte-different — the most common integration bug."""
    body = activity_event()
    signature = sign(body)
    reserialised = json.dumps(json.loads(body), indent=2).encode("utf-8")

    assert post(reserialised, signature).status_code == 401


def test_returns_400_when_the_signature_header_is_missing():
    res = post(activity_event())

    assert res.status_code == 400
    assert res.json() == {"error": "Missing Signature header"}


def test_does_not_error_on_a_malformed_short_signature():
    """compare_digest returns False on a length mismatch rather than raising."""
    assert post(activity_event(), "x").status_code == 401


def test_does_not_error_on_a_non_hex_signature_of_the_right_length():
    assert post(activity_event(), "z" * 64).status_code == 401


def test_accepts_an_uppercase_hex_signature():
    body = activity_event()

    assert post(body, sign(body).upper()).status_code == 200


def test_returns_400_for_a_valid_signature_over_invalid_json():
    body = b"not json at all"
    res = post(body, sign(body))

    assert res.status_code == 400
    assert res.json() == {"error": "Invalid JSON"}


def test_reads_the_signature_header_case_insensitively():
    body = activity_event()
    res = client.post(
        "/webhooks/mailersend",
        content=body,
        headers={"Content-Type": "application/json", "signature": sign(body)},
    )

    assert res.status_code == 200


# === webhook.test URL-validation ping ======================================


def test_accepts_the_ping_signed_with_the_fixed_public_test_secret():
    """MailerSend signs the ping with the public test secret, not yours.

    Rejecting it means MailerSend never gets a 2xx and the webhook is not saved.
    """
    res = post(TEST_PING, sign(TEST_PING, MAILERSEND_TEST_SECRET))

    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_also_accepts_the_ping_signed_with_the_webhook_signing_secret():
    assert post(TEST_PING, sign(TEST_PING, SECRET)).status_code == 200


def test_rejects_the_ping_when_signed_with_neither_secret():
    assert post(TEST_PING, sign(TEST_PING, "some_other_secret")).status_code == 401


def test_ping_envelope_has_message_and_no_data():
    parsed = json.loads(TEST_PING)
    assert "data" not in parsed
    assert parsed["message"] == "This is a ping test message"

    assert post(TEST_PING, sign(TEST_PING, MAILERSEND_TEST_SECRET)).status_code == 200


def test_documented_test_secret_value():
    assert MAILERSEND_TEST_SECRET == "test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G"


# === The public test secret cannot authorise a real event ==================


def test_rejects_a_real_event_signed_with_the_public_test_secret():
    """The test secret is published in the docs — anyone can forge it.

    It must therefore only ever authorise a `webhook.test` payload.
    """
    body = activity_event("activity.hard_bounced")
    res = post(body, sign(body, MAILERSEND_TEST_SECRET))

    assert res.status_code == 401
    assert res.json() == {"error": "Invalid signature"}


def test_rejects_an_sms_event_signed_with_the_public_test_secret():
    body = json.dumps(
        {
            "type": "sms.failed",
            "created_at": "2025-08-05T21:23:54.000000Z",
            "data": {"id": "sms_1"},
        }
    ).encode("utf-8")

    assert post(body, sign(body, MAILERSEND_TEST_SECRET)).status_code == 401


# === Event handling ========================================================


@pytest.mark.parametrize(
    "event_type",
    [
        "activity.sent",
        "activity.delivered",
        "activity.soft_bounced",
        "activity.hard_bounced",
        "activity.deferred",
        "activity.opened",
        "activity.opened_unique",
        "activity.clicked",
        "activity.clicked_unique",
        "activity.unsubscribed",
        "activity.spam_complaint",
        "activity.survey_opened",
        "activity.survey_submitted",
    ],
)
def test_accepts_each_activity_event(event_type):
    body = activity_event(event_type)

    assert post(body, sign(body)).status_code == 200


def test_accepts_sender_identity_verified_with_space_separated_created_at():
    body = json.dumps(
        {
            "type": "sender_identity.verified",
            "created_at": "2025-08-05 22:27:14",
            "data": {"id": "si_1", "email": "sender@example.com"},
        }
    ).encode("utf-8")

    assert post(body, sign(body)).status_code == 200


@pytest.mark.parametrize("event_type", ["maintenance.start", "maintenance.end"])
def test_accepts_maintenance_events(event_type):
    body = json.dumps(
        {
            "type": event_type,
            "created_at": "2025-08-05 22:27:14",
            "data": {"id": f"mnt_{event_type}"},
        }
    ).encode("utf-8")

    assert post(body, sign(body)).status_code == 200


def test_accepts_inbound_message_rejected_with_a_documented_reason():
    body = json.dumps(
        {
            "type": "inbound_message.rejected",
            "created_at": "2025-08-05T21:23:54.000000Z",
            "data": {"id": "inb_1", "reason": "attachment_size_exceeded"},
        }
    ).encode("utf-8")

    assert post(body, sign(body)).status_code == 200


def test_accepts_an_unknown_event_type():
    body = json.dumps(
        {
            "type": "some.future.event",
            "created_at": "2025-08-05T21:23:54.000000Z",
            "data": {"id": "future_1"},
        }
    ).encode("utf-8")

    assert post(body, sign(body)).status_code == 200


def test_is_idempotent_on_data_id():
    body = activity_event("activity.opened", event_id="dedupe-me-once")
    signature = sign(body)

    # Both acknowledge 200 — a duplicate must never be retried at MailerSend
    assert post(body, signature).status_code == 200
    assert post(body, signature).status_code == 200


# === verify_signature unit tests ===========================================


def test_verify_signature_returns_true_for_a_matching_signature():
    body = b'{"type":"activity.sent"}'

    assert verify_signature(body, sign(body), SECRET) is True


def test_verify_signature_returns_false_rather_than_raising():
    body = b"{}"

    assert verify_signature(body, "", SECRET) is False
    assert verify_signature(body, sign(body), "") is False
    assert verify_signature(body, None, SECRET) is False


def test_verify_signature_matches_the_docs_sample_algorithm():
    """hex, not base64; raw body only, no timestamp concatenation."""
    raw = b'{"type":"webhook.test"}'
    expected = hmac.new(SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()

    assert len(expected) == 64
    assert all(c in "0123456789abcdef" for c in expected)
    assert verify_signature(raw, expected, SECRET) is True


def test_verify_signature_handles_a_non_ascii_signature_header():
    """compare_digest raises TypeError on non-ASCII str; we compare bytes."""
    assert verify_signature(b"{}", "sígnature", SECRET) is False


# === Payload quirks ========================================================


def test_parses_both_documented_created_at_formats():
    iso = parse_created_at("2025-08-05T21:23:54.000000Z")
    assert iso is not None
    assert iso.tzinfo is not None
    assert iso.astimezone(timezone.utc).isoformat() == "2025-08-05T21:23:54+00:00"

    # Space-separated, no timezone — must be read as UTC, not naive local time
    spaced = parse_created_at("2025-08-05 22:27:14")
    assert spaced is not None
    assert spaced.astimezone(timezone.utc).isoformat() == "2025-08-05T22:27:14+00:00"


def test_returns_none_for_an_unparseable_created_at():
    assert parse_created_at("not a date") is None
    assert parse_created_at(None) is None


def test_normalises_meta_from_an_empty_list_to_a_dict():
    # MailerSend sends `"meta": []` when there is nothing to report
    assert normalize_meta([]) == {}
    assert normalize_meta({"reason": "bounced"}) == {"reason": "bounced"}
    assert normalize_meta(None) == {}
