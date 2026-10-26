import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Agentcard endpoint secrets look like whsec_..., but the WHOLE string is the HMAC key (UTF-8).
# It is not base64 and the prefix is not stripped. This one is only for tests.
SECRET = "whsec_dGVzdF9hZ2VudGNhcmRfc2VjcmV0"
os.environ["AGENTCARD_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def v1_for(body: str, ts: int, secret=SECRET) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode()
    return hmac.new(key, f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={v1_for(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json", header="AgentCard-Signature"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        # str values are encoded as UTF-8 so non-ASCII headers can be tested
        headers[header] = signature
    raw_headers = [(k.lower().encode(), v.encode("utf-8")) for k, v in headers.items()]
    return client.post("/webhooks/agentcard", content=body, headers=raw_headers)


def envelope(event_type: str, data: dict) -> str:
    return json.dumps({"id": "evt_9f8e7d6c5b4a", "type": event_type, "created": 1757264400, "livemode": False, "data": data})


CARD_CREATED = envelope("card.created", {"id": "card_7h2k", "last4": "7318", "balance_cents": 1000, "status": "OPEN"})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(CARD_CREATED, sign(CARD_CREATED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(CARD_CREATED, sign(CARD_CREATED), "text/plain").status_code == 200

    def test_uses_whole_whsec_secret_not_decoded(self):
        import base64

        ts = int(time.time())
        decoded = base64.b64decode(SECRET[len("whsec_"):])
        stripped = SECRET[len("whsec_"):]
        assert post(CARD_CREATED, f"t={ts},v1={v1_for(CARD_CREATED, ts, decoded)}").status_code == 400
        assert post(CARD_CREATED, f"t={ts},v1={v1_for(CARD_CREATED, ts, stripped)}").status_code == 400

    def test_allows_space_after_comma(self):
        ts = int(time.time())
        assert post(CARD_CREATED, f"t={ts}, v1={v1_for(CARD_CREATED, ts)}").status_code == 200

    def test_accepts_when_any_v1_matches(self):
        ts = int(time.time())
        old = v1_for(CARD_CREATED, ts, "whsec_old_secret")
        good = v1_for(CARD_CREATED, ts)
        assert post(CARD_CREATED, f"t={ts},v1={old},v1={good}").status_code == 200
        assert post(CARD_CREATED, f"t={ts},v1={good},v1={old}").status_code == 200
        assert post(CARD_CREATED, f"t={ts},v1={old},v1={old[:-1]}0").status_code == 400

    def test_accepts_uppercase_hex(self):
        ts = int(time.time())
        assert post(CARD_CREATED, f"t={ts},v1={v1_for(CARD_CREATED, ts).upper()}").status_code == 200

    def test_rejects_missing_header(self):
        assert post(CARD_CREATED, None).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(CARD_CREATED.replace("1000", "9000"), sign(CARD_CREATED)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(CARD_CREATED, sign(CARD_CREATED, secret="whsec_other")).status_code == 400

    def test_rejects_bad_v1_without_error(self):
        ts = 1700000000
        assert post(CARD_CREATED, f"t={ts},v1=abc").status_code == 400
        assert post(CARD_CREATED, f"t={ts},v1={'zz' * 32}").status_code == 400
        # non-ASCII header value: compare_digest on bytes gives 400, not a 500
        assert post(CARD_CREATED, f"t={ts},v1={'é' * 64}").status_code == 400

    def test_rejects_headers_without_t_or_v1(self):
        ts = int(time.time())
        assert post(CARD_CREATED, f"v1={v1_for(CARD_CREATED, ts)}").status_code == 400
        assert post(CARD_CREATED, f"t={ts}").status_code == 400
        assert post(CARD_CREATED, "garbage").status_code == 400
        assert post(CARD_CREATED, "t=abc,v1=deadbeef").status_code == 400

    def test_rejects_altered_timestamp(self):
        header = sign(CARD_CREATED, 1700000000).replace("t=1700000000", "t=1700000001")
        assert post(CARD_CREATED, header).status_code == 400

    def test_ignores_legacy_header(self):
        legacy = "sha256=" + hmac.new(SECRET.encode(), CARD_CREATED.encode(), hashlib.sha256).hexdigest()
        assert post(CARD_CREATED, legacy, header="X-AgentCard-Signature").status_code == 400

    def test_accepts_old_timestamp_by_default(self):
        old = int(time.time()) - 3600
        assert post(CARD_CREATED, sign(CARD_CREATED, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(CARD_CREATED, sign(CARD_CREATED, old)).status_code == 400
        assert post(CARD_CREATED, sign(CARD_CREATED)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(CARD_CREATED, sign(CARD_CREATED, old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize(
        "event_type,data",
        [
            ("card.created", {"id": "card_7h2k", "last4": "7318", "balance_cents": 1000, "status": "OPEN"}),
            ("card.updated", {"id": "card_7h2k", "last4": "7318", "balance_cents": 325, "status": "OPEN"}),
            ("card.closed", {"id": "card_7h2k", "last4": "7318", "balance_cents": 0, "status": "CLOSED"}),
            ("transaction.authorized", {"id": "txn_3f9a", "card_id": "card_7h2k", "amount_display": "$6.75", "merchant": "COFFEE SHOP #42"}),
            ("approval.requested", {"approval_id": "appr_4d5e6f", "action": "cross_app:close", "expires_at": "2026-09-07T17:15:00Z"}),
            ("checkout_authorization.approved", {"authorization_id": "cauth_2q9d", "amount_display": "$23.06", "merchant": "shop.example.com"}),
            ("balance.low", {"card_id": "card_7h2k", "last4": "7318", "balance_cents": 120}),
            ("transaction.cleared", {"id": "txn_3f9a"}),
        ],
    )
    def test_handles_event(self, caplog, event_type, data):
        body = envelope(event_type, data)
        with caplog.at_level(logging.INFO, logger="agentcard-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        if event_type == "transaction.cleared":
            assert f"Unhandled event: {event_type}" in caplog.text
        else:
            assert "Unhandled" not in caplog.text

    def test_rejects_verified_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400
