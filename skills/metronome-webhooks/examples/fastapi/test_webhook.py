import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["METRONOME_WEBHOOK_SECRET"] = "correct-horse-battery-staple"

from main import (  # noqa: E402
    app,
    build_signed_bytes,
    compute_metronome_signature,
    is_date_within_tolerance,
    seen_event_ids,
    verify_metronome_signature,
)

SECRET = "correct-horse-battery-staple"
DATE = "Mon, 02 Jan 2006 22:04:05 GMT"

# Published test vector from Metronome's docs (setup-webhooks#verify-signatures).
# The body is pretty-printed exactly as the docs show it, with no trailing newline.
VECTOR_BODY = (
    '{\n  "id": "b2c9e307-624e-4e7d-a5a4-1b74107d78c4",\n  "type": "widget_created",\n'
    '  "properties": {\n    "customer_id": "5f794d50-085a-4db6-8d15-286e518b7225",\n'
    '    "widget_id": "0891458d-b6f0-4fdd-a41e-380aae1a1e38"\n  }\n}'
).encode()
VECTOR_SIGNATURE = "b82652fa2246cf1d8a27e591f155c865f68b46c19b9213fd9c052f2419b4742b"

client = TestClient(app)


def sign(payload, date=DATE, key=SECRET):
    """Sign like Metronome: HMAC-SHA256(secret, X-Metronome-Date + "\\n" + body), hex."""
    if isinstance(payload, str):
        payload = payload.encode()
    return hmac.new(key.encode(), date.encode("latin-1") + b"\x0a" + payload, hashlib.sha256).hexdigest()


def spend_alert(event_id="a1b2c3d4-0000-4000-8000-000000000001"):
    # Based on the docs' alerts.spend_threshold_reached example
    return json.dumps({
        "id": event_id,
        "properties": {
            "customer_id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
            "alert_id": "7f8a9b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c",
            "timestamp": "2024-10-07T16:30:15.123Z",
            "threshold": 10000,
            "alert_name": "Spend threshold exceeded",
            "current_spend": 12500,
            "triggered_by": "usage",
        },
        "type": "alerts.spend_threshold_reached",
    })


def post(body, **headers):
    return client.post(
        "/webhooks/metronome",
        content=body,
        headers={"content-type": "application/json", **headers},
    )


def signed(payload):
    return {"x-metronome-date": DATE, "metronome-webhook-signature": sign(payload)}


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv("METRONOME_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("METRONOME_WEBHOOK_TOLERANCE_SECONDS", raising=False)
    seen_event_ids.clear()


class TestPublishedVector:
    def test_computes_documented_signature(self):
        assert compute_metronome_signature(VECTOR_BODY, DATE, SECRET) == VECTOR_SIGNATURE

    def test_accepts_documented_headers_and_secret(self):
        assert verify_metronome_signature(VECTOR_BODY, VECTOR_SIGNATURE, DATE, SECRET)

    def test_accepts_vector_through_endpoint(self):
        res = post(
            VECTOR_BODY,
            **{"x-metronome-date": DATE, "metronome-webhook-signature": VECTOR_SIGNATURE},
        )
        assert res.status_code == 200


class TestSignedBytes:
    def test_separator_is_a_real_lf_not_backslash_n(self):
        signed_bytes = build_signed_bytes(b"{}", DATE)
        assert b"\x0a" in signed_bytes
        assert b"\\n" not in signed_bytes
        assert signed_bytes == DATE.encode() + b"\n{}"

    def test_body_bytes_untouched(self):
        body = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        assert build_signed_bytes(body, DATE).endswith(body)


class TestVerify:
    body = spend_alert().encode()

    def test_valid_and_uppercase(self):
        assert verify_metronome_signature(self.body, sign(self.body), DATE, SECRET)
        assert verify_metronome_signature(self.body, sign(self.body).upper(), DATE, SECRET)

    def test_missing_or_empty_inputs(self):
        good = sign(self.body)
        assert not verify_metronome_signature(self.body, None, DATE, SECRET)
        assert not verify_metronome_signature(self.body, "", DATE, SECRET)
        assert not verify_metronome_signature(self.body, good, None, SECRET)
        assert not verify_metronome_signature(self.body, good, "", SECRET)
        assert not verify_metronome_signature(self.body, good, DATE, None)

    def test_malformed_signatures(self):
        good = sign(self.body)
        assert not verify_metronome_signature(self.body, good[:62], DATE, SECRET)
        assert not verify_metronome_signature(self.body, good + "00", DATE, SECRET)
        assert not verify_metronome_signature(self.body, "g" * 64, DATE, SECRET)
        assert not verify_metronome_signature(self.body, "sha256=" + good, DATE, SECRET)
        assert not verify_metronome_signature(self.body, good + ", " + good, DATE, SECRET)
        assert not verify_metronome_signature(self.body, "é" * 64, DATE, SECRET)

    def test_tampered_body_date_or_secret(self):
        good = sign(self.body)
        assert not verify_metronome_signature(spend_alert("other").encode(), good, DATE, SECRET)
        assert not verify_metronome_signature(self.body, good, "Tue, 03 Jan 2006 22:04:05 GMT", SECRET)
        assert not verify_metronome_signature(self.body, sign(self.body, key="wrong"), DATE, SECRET)


class TestTolerance:
    now = 1136239445.0  # DATE as a Unix timestamp

    def test_off_by_default(self):
        assert is_date_within_tolerance(DATE, 0, self.now + 10 * 86400)

    def test_window_when_set(self):
        assert is_date_within_tolerance(DATE, 300, self.now + 60)
        assert not is_date_within_tolerance(DATE, 300, self.now + 600)
        assert not is_date_within_tolerance("not a date", 300, self.now)


class TestEndpoint:
    def test_valid_webhook(self):
        payload = spend_alert()
        res = post(payload, **signed(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_any_content_type_uses_exact_bytes(self):
        payload = spend_alert("a1b2c3d4-0000-4000-8000-000000000002")
        res = client.post(
            "/webhooks/metronome",
            content=payload,
            headers={"content-type": "text/plain", **signed(payload)},
        )
        assert res.status_code == 200

    def test_missing_signature(self):
        assert post(spend_alert(), **{"x-metronome-date": DATE}).status_code == 401

    def test_missing_date_header(self):
        payload = spend_alert()
        assert post(payload, **{"metronome-webhook-signature": sign(payload)}).status_code == 401

    def test_signature_over_standard_date_header_rejected(self):
        payload = spend_alert()
        other = "Tue, 03 Jan 2006 22:04:05 GMT"
        res = post(
            payload,
            **{
                "x-metronome-date": DATE,
                "date": other,
                "metronome-webhook-signature": sign(payload, other),
            },
        )
        assert res.status_code == 401

    def test_bad_signature(self):
        res = post(spend_alert(), **{"x-metronome-date": DATE, "metronome-webhook-signature": "a" * 64})
        assert res.status_code == 401

    def test_signed_non_json_body(self):
        assert post("not json", **signed("not json")).status_code == 400

    def test_duplicate_id_not_reprocessed(self):
        payload = spend_alert("a1b2c3d4-0000-4000-8000-000000000003")
        assert post(payload, **signed(payload)).json() == {"received": True}
        assert post(payload, **signed(payload)).json() == {"received": True, "duplicate": True}

    def test_old_date_accepted_without_tolerance(self):
        payload = spend_alert()
        assert post(payload, **signed(payload)).status_code == 200

    def test_old_date_rejected_with_tolerance(self, monkeypatch):
        monkeypatch.setenv("METRONOME_WEBHOOK_TOLERANCE_SECONDS", "300")
        payload = spend_alert()
        assert post(payload, **signed(payload)).status_code == 401

    def test_flat_events_and_unknown_types(self):
        for event in (
            {"id": "c-1", "type": "contract.create", "contract_id": "k1", "customer_id": "u1"},
            {"id": "c-2", "type": "some.future_event"},
        ):
            payload = json.dumps(event)
            assert post(payload, **signed(payload)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
