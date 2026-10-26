import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# Lob webhook secrets are opaque strings from the dashboard; the HMAC key is their UTF-8 bytes.
SECRET = "test_lob_webhook_secret"

# Payload based on the sample in Lob's webhook docs (self_mailer.rendered_thumbnails).
SAMPLE_PAYLOAD = {
    "event_type": {
        "resource": "self mailers",
        "enabled_for_test": True,
        "id": "self_mailer.rendered_thumbnails",
        "object": "event_type",
    },
    "reference_id": "sfm_c29bbbca5f7bd489",
    "date_created": "2021-12-16T01:34:18.159Z",
    "id": "evt_d47ff1b815373f67",
    "body": {
        "id": "sfm_c29bbbca5f7bd489",
        "description": "self mailer create",
        "carrier": "USPS",
        "tracking_events": [],
        "thumbnails": [{"small": "REDACTED", "medium": "REDACTED", "large": "REDACTED"}],
        "size": "6x18_bifold",
        "mail_type": "usps_first_class",
        "object": "self_mailer",
    },
    "object": "event",
}


def event_of(event_type_id: str) -> dict:
    return {
        "event_type": {"id": event_type_id, "object": "event_type"},
        "id": "evt_test",
        "body": {"id": "psc_123"},
        "object": "event",
    }


def sign(raw_body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly as Lob does: hex HMAC-SHA256 over `{timestamp}.{raw body}`."""
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def now_ms() -> str:
    return str(int(time.time() * 1000))


def post(payload, timestamp=None, signature=None, omit_timestamp=False, omit_signature=False,
         content_type="application/json"):
    body = payload if isinstance(payload, bytes) else (
        payload.encode() if isinstance(payload, str) else json.dumps(payload).encode()
    )
    timestamp = timestamp if timestamp is not None else now_ms()
    headers = {"content-type": content_type}
    if not omit_timestamp:
        headers["lob-signature-timestamp"] = timestamp
    if not omit_signature:
        headers["lob-signature"] = signature if signature is not None else sign(body, timestamp)
    return client.post("/webhooks/lob", content=body, headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("LOB_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("LOB_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(SAMPLE_PAYLOAD)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_digest(self):
        body = json.dumps(SAMPLE_PAYLOAD).encode()
        ts = now_ms()
        assert post(body, timestamp=ts, signature=sign(body, ts).upper()).status_code == 200

    def test_verifies_exact_raw_bytes(self):
        body = (
            json.dumps(SAMPLE_PAYLOAD, indent=2, ensure_ascii=False)
            .replace("self mailer create", "self mailer créé")
            .replace("\n", "\r\n")
            .encode("utf-8")
        )
        assert post(body).status_code == 200

    def test_verifies_any_content_type(self):
        assert post(SAMPLE_PAYLOAD, content_type="text/plain").status_code == 200

    def test_rejects_missing_signature(self):
        assert post(SAMPLE_PAYLOAD, omit_signature=True).status_code == 401

    def test_rejects_missing_timestamp(self):
        sig = sign(json.dumps(SAMPLE_PAYLOAD).encode(), "1")
        assert post(SAMPLE_PAYLOAD, signature=sig, omit_timestamp=True).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(SAMPLE_PAYLOAD, signature="").status_code == 401

    def test_rejects_wrong_length_signature(self):
        assert post(SAMPLE_PAYLOAD, signature="abc123").status_code == 401

    def test_rejects_non_hex_signature(self):
        assert post(SAMPLE_PAYLOAD, signature="z" * 64).status_code == 401

    def test_rejects_prefixed_signature(self):
        body = json.dumps(SAMPLE_PAYLOAD).encode()
        ts = now_ms()
        assert post(body, timestamp=ts, signature="sha256=" + sign(body, ts)).status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(SAMPLE_PAYLOAD).encode()
        ts = now_ms()
        sig = sign(body, ts)
        assert post(body.replace(b"sfm_", b"sfn_"), timestamp=ts, signature=sig).status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = json.dumps(SAMPLE_PAYLOAD).encode()
        sig = sign(body, "1700000000000")
        assert post(body, timestamp="1700000000001", signature=sig).status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(SAMPLE_PAYLOAD).encode()
        ts = now_ms()
        assert post(body, timestamp=ts, signature=sign(body, ts, "whsec_other")).status_code == 401

    def test_rejects_debugger_literal_secret(self):
        # Events from Lob's webhook debugger are signed with the literal secret "secret".
        body = json.dumps(SAMPLE_PAYLOAD).encode()
        ts = now_ms()
        assert post(body, timestamp=ts, signature=sign(body, ts, "secret")).status_code == 401

    def test_returns_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("LOB_WEBHOOK_SECRET")
        assert post(SAMPLE_PAYLOAD).status_code == 500


class TestTimestampTolerance:
    @staticmethod
    def old_ts() -> str:
        return str(int((time.time() - 3600) * 1000))  # 1 hour old, milliseconds

    def test_old_timestamp_accepted_by_default(self):
        assert post(SAMPLE_PAYLOAD, timestamp=self.old_ts()).status_code == 200

    def test_zero_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("LOB_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert post(SAMPLE_PAYLOAD, timestamp=self.old_ts()).status_code == 200

    def test_old_timestamp_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("LOB_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(SAMPLE_PAYLOAD, timestamp=self.old_ts()).status_code == 401

    def test_fresh_timestamp_accepted_milliseconds(self, monkeypatch):
        monkeypatch.setenv("LOB_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(SAMPLE_PAYLOAD, timestamp=now_ms()).status_code == 200

    def test_fresh_timestamp_accepted_seconds(self, monkeypatch):
        monkeypatch.setenv("LOB_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(SAMPLE_PAYLOAD, timestamp=str(int(time.time()))).status_code == 200

    def test_non_numeric_timestamp_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("LOB_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(SAMPLE_PAYLOAD, timestamp="2021-12-16T01:34:18.159Z").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize(
        "event_type",
        [
            "postcard.created",
            "postcard.delivered",
            "postcard.re-routed",
            "letter.mailed",
            "letter.delivered",
            "check.in_transit",
            "self_mailer.rendered_thumbnails",
        ],
    )
    def test_handles_event(self, event_type):
        res = post(event_of(event_type))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_acknowledges_unhandled_event(self):
        assert post(event_of("bank_account.verified")).status_code == 200

    def test_signed_non_json_body_returns_400(self):
        assert post("not json").status_code == 400


class TestOtherRoutes:
    def test_health(self):
        assert client.get("/health").status_code == 200

    def test_get_not_allowed_on_webhook_route(self):
        assert client.get("/webhooks/lob").status_code == 405
