import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

# Tiltify's published worked example (developers.tiltify.com, Verifying Signature).
VECTOR = {
    "secret": "13c3b68914487acd1c68d85857ee1cfc308f15510f2d8e71273ee0f8a42d9d00",
    "body": '{"data":{"amount":{"currency":"USD","value":"82.95"},"campaign_id":"a4fd5207-bd9f-4712-920a-85f8d92cf4e6","completed_at":"2023-04-18T16:48:26.510702Z","created_at":"2023-04-18T03:36:36.510717Z","donor_comment":"Rerum quo necessitatibus voluptas provident ad molestiae ipsam.","donor_name":"Jirachi","fundraising_event_id":null,"id":"dfa25dcc-2026-4320-a5b7-5da076efeb05","legacy_id":0,"poll_id":null,"poll_option_id":null,"reward_id":null,"sustained":false,"target_id":null,"team_event_id":null},"meta":{"attempted_at":"2023-04-18T16:49:00.617031Z","event_type":"public:direct:donation_updated","generated_at":"2023-04-18T16:48:59.510758Z","id":"d8768e26-1092-4f4c-a829-a2698cd19664","subscription_source_id":"00000000-0000-0000-0000-000000000000","subscription_source_type":"test"}}',
    "headers": {
        "x-tiltify-timestamp": "2023-04-18T16:49:00.617031Z",
        "x-tiltify-signature": "4OSwlhTt0EcrlSQFlqgE18FOtT+EKX4qTJdJeC8oV/o=",
    },
}

SECRET = VECTOR["secret"]
OLD_TS = "2023-04-18T16:49:00.617031Z"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("TILTIFY_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("TILTIFY_WEBHOOK_TOLERANCE_SECONDS", raising=False)


from main import app, verify_tiltify_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Matches Tiltify's algorithm: base64 HMAC-SHA256 over `{timestamp}.{raw body}`."""
    digest = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"


def post(body: bytes, headers: dict, content_type: str = "application/json"):
    return client.post(
        "/webhooks/tiltify",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


BODY = json.dumps(
    {
        "data": {"id": "f1", "donor_name": "Zoe", "amount": {"currency": "USD", "value": "5.00"}},
        "meta": {"event_type": "public:direct:donation_updated", "id": "evt_1"},
    }
).encode()


# --- published test vector -------------------------------------------------


def test_vector_sign_reproduces_documented_signature():
    body = VECTOR["body"].encode()
    assert sign(body, VECTOR["headers"]["x-tiltify-timestamp"]) == VECTOR["headers"]["x-tiltify-signature"]


def test_vector_verifier_accepts_documented_request():
    valid, error = verify_tiltify_signature(
        VECTOR["body"].encode(),
        VECTOR["headers"]["x-tiltify-signature"],
        VECTOR["headers"]["x-tiltify-timestamp"],
        VECTOR["secret"],
    )
    assert (valid, error) == (True, None)


def test_vector_endpoint_accepts_documented_request():
    res = post(
        VECTOR["body"].encode(),
        {
            "X-Tiltify-Signature": VECTOR["headers"]["x-tiltify-signature"],
            "X-Tiltify-Timestamp": VECTOR["headers"]["x-tiltify-timestamp"],
        },
    )
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_vector_secret_is_utf8_text_not_hex_decoded():
    wrong = base64.b64encode(
        hmac.new(
            bytes.fromhex(VECTOR["secret"]),
            VECTOR["headers"]["x-tiltify-timestamp"].encode() + b"." + VECTOR["body"].encode(),
            hashlib.sha256,
        ).digest()
    ).decode()
    assert wrong != VECTOR["headers"]["x-tiltify-signature"]


# --- endpoint --------------------------------------------------------------


def test_accepts_valid_signature():
    ts = now_iso()
    res = post(BODY, {"X-Tiltify-Signature": sign(BODY, ts), "X-Tiltify-Timestamp": ts})
    assert res.status_code == 200


def test_verifies_raw_bytes_whatever_the_content_type():
    ts = now_iso()
    res = post(BODY, {"X-Tiltify-Signature": sign(BODY, ts), "X-Tiltify-Timestamp": ts}, "text/plain")
    assert res.status_code == 200


def test_rejects_missing_signature_header():
    assert post(BODY, {"X-Tiltify-Timestamp": now_iso()}).status_code == 401


def test_rejects_missing_timestamp_header():
    assert post(BODY, {"X-Tiltify-Signature": sign(BODY, now_iso())}).status_code == 401


def test_rejects_malformed_signatures():
    ts = now_iso()
    good = sign(BODY, ts)
    for sig in [good[:-1], good[:-1] + "!", good[:-1] + "AA", f"sha256={good}", f"{good},{good}"]:
        res = post(BODY, {"X-Tiltify-Signature": sig, "X-Tiltify-Timestamp": ts})
        assert res.status_code == 401, sig


def test_compares_base64_case_sensitively():
    ts = now_iso()
    res = post(BODY, {"X-Tiltify-Signature": sign(BODY, ts).lower(), "X-Tiltify-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_non_canonical_base64():
    ts = now_iso()
    sig = sign(BODY, ts)
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    # A stray low bit in the last character decodes to the same bytes, but is not the signature sent
    bad = sig[:42] + alphabet[alphabet.index(sig[42]) | 1] + "="
    res = post(BODY, {"X-Tiltify-Signature": bad, "X-Tiltify-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_signature_from_another_secret():
    ts = now_iso()
    res = post(BODY, {"X-Tiltify-Signature": sign(BODY, ts, "other_secret"), "X-Tiltify-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_tampered_body():
    ts = now_iso()
    res = post(b'{"meta":{"event_type":"x"}}', {"X-Tiltify-Signature": sign(BODY, ts), "X-Tiltify-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_reserialised_body():
    pretty = json.dumps(json.loads(BODY), indent=2).encode()
    ts = now_iso()
    res = post(pretty, {"X-Tiltify-Signature": sign(BODY, ts), "X-Tiltify-Timestamp": ts})
    assert res.status_code == 401


def test_rejects_timestamp_that_was_not_signed():
    res = post(
        BODY,
        {"X-Tiltify-Signature": sign(BODY, OLD_TS), "X-Tiltify-Timestamp": "2023-04-18T16:49:00.617032Z"},
    )
    assert res.status_code == 401


def test_accepts_old_timestamps_by_default():
    res = post(BODY, {"X-Tiltify-Signature": sign(BODY, OLD_TS), "X-Tiltify-Timestamp": OLD_TS})
    assert res.status_code == 200


def test_rejects_old_timestamps_when_tolerance_enabled(monkeypatch):
    monkeypatch.setenv("TILTIFY_WEBHOOK_TOLERANCE_SECONDS", "300")
    stale = post(BODY, {"X-Tiltify-Signature": sign(BODY, OLD_TS), "X-Tiltify-Timestamp": OLD_TS})
    assert stale.status_code == 401

    ts = now_iso()
    fresh = post(BODY, {"X-Tiltify-Signature": sign(BODY, ts), "X-Tiltify-Timestamp": ts})
    assert fresh.status_code == 200


def test_returns_400_for_validly_signed_non_json():
    ts = now_iso()
    res = post(b"not json", {"X-Tiltify-Signature": sign(b"not json", ts), "X-Tiltify-Timestamp": ts})
    assert res.status_code == 400


@pytest.mark.parametrize(
    "event_type",
    [
        "public:direct:donation_updated",
        "public:direct:fact_updated",
        "private:direct:donation_updated",
        "private:direct:fact_updated",
        "public:indirect:donation_updated",
        "public:indirect:fact_updated",
        "private:indirect:donation_updated",
        "private:indirect:fact_updated",
        "something:new:event",
    ],
)
def test_acknowledges_event_type(event_type):
    payload = json.dumps({"data": {"id": "x"}, "meta": {"event_type": event_type, "id": "e"}}).encode()
    ts = now_iso()
    res = post(payload, {"X-Tiltify-Signature": sign(payload, ts), "X-Tiltify-Timestamp": ts})
    assert res.status_code == 200


# --- verifier --------------------------------------------------------------

RAW = b'{"meta":{"event_type":"public:direct:fact_updated"}}'


def test_tolerance_is_relative_to_supplied_clock():
    sig = sign(RAW, OLD_TS)
    sent = datetime(2023, 4, 18, 16, 49, 0, 617031, tzinfo=timezone.utc)
    assert verify_tiltify_signature(RAW, sig, OLD_TS, SECRET, 300, sent + timedelta(seconds=100))[0]
    assert not verify_tiltify_signature(RAW, sig, OLD_TS, SECRET, 300, sent + timedelta(seconds=400))[0]


def test_non_iso_timestamp_rejected_when_tolerance_on():
    assert not verify_tiltify_signature(RAW, sign(RAW, "1700000000"), "1700000000", SECRET, 300)[0]


def test_whitespace_around_signature_is_not_trimmed():
    sig = sign(RAW, OLD_TS)
    assert not verify_tiltify_signature(RAW, sig + " ", OLD_TS, SECRET)[0]
    assert not verify_tiltify_signature(RAW, " " + sig, OLD_TS, SECRET)[0]


def test_empty_signature():
    assert not verify_tiltify_signature(RAW, "", OLD_TS, SECRET)[0]
