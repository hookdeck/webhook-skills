import base64
import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

# The signing key is any string you choose in the Buttondown webhook settings.
# It is used as-is (UTF-8), not decoded. This one is only for tests.
SECRET = "test_buttondown_signing_key_long_and_random"
os.environ["BUTTONDOWN_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def hex_for(body: str, secret=SECRET) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode()
    return hmac.new(key, body.encode(), hashlib.sha256).hexdigest()


def sign(body: str, secret=SECRET) -> str:
    return f"sha256={hex_for(body, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        # str values are encoded as UTF-8 so non-ASCII headers can be tested
        headers["X-Buttondown-Signature"] = signature
    raw_headers = [(k.lower().encode(), v.encode("utf-8")) for k, v in headers.items()]
    return client.post("/webhooks/buttondown", content=body, headers=raw_headers)


def payload(event_type: str, data: dict) -> str:
    return json.dumps({"event_type": event_type, "data": data})


IDS = {
    "newsletter": "13121cd6-0dfc-424c-bb12-988b0a32fcb3",
    "subscriber": "ac79483b-cd28-49c1-982e-8a88e846d7e7",
}

# Shape from Buttondown's documentation
CONFIRMED = payload("subscriber.confirmed", IDS)


class TestSignatureVerification:
    def test_accepts_valid_sha256_prefixed_signature(self):
        res = post(CONFIRMED, sign(CONFIRMED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_bare_digest(self):
        assert post(CONFIRMED, hex_for(CONFIRMED)).status_code == 200

    def test_accepts_uppercase_hex(self):
        assert post(CONFIRMED, f"sha256={hex_for(CONFIRMED).upper()}").status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post(CONFIRMED, sign(CONFIRMED), "text/plain").status_code == 200

    def test_verifies_exact_bytes(self):
        body = '{ "data" : {"subscriber":"s1",  "newsletter":"n1"},\n"event_type":"subscriber.created" }'
        assert post(body, sign(body)).status_code == 200

    def test_uses_key_as_plain_utf8_not_decoded(self, monkeypatch):
        key = os.urandom(16).hex()
        monkeypatch.setenv("BUTTONDOWN_WEBHOOK_SECRET", key)
        assert post(CONFIRMED, sign(CONFIRMED, key)).status_code == 200
        assert post(CONFIRMED, sign(CONFIRMED, bytes.fromhex(key))).status_code == 401
        assert post(CONFIRMED, sign(CONFIRMED, base64.b64decode(key))).status_code == 401

    def test_rejects_missing_or_empty_header(self):
        assert post(CONFIRMED, None).status_code == 401
        assert post(CONFIRMED, "").status_code == 401
        assert post(CONFIRMED, "sha256=").status_code == 401

    def test_rejects_tampered_body(self):
        assert post(CONFIRMED.replace("ac79", "bc79"), sign(CONFIRMED)).status_code == 401

    def test_rejects_wrong_key(self):
        assert post(CONFIRMED, sign(CONFIRMED, "another_key")).status_code == 401

    def test_rejects_malformed_signatures_without_error(self):
        good = hex_for(CONFIRMED)
        assert post(CONFIRMED, "sha256=abc").status_code == 401
        assert post(CONFIRMED, f"sha256={good}00").status_code == 401
        assert post(CONFIRMED, f"sha256={'zz' * 32}").status_code == 401
        # non-ASCII header value: compare_digest on bytes gives 401, not a 500
        assert post(CONFIRMED, f"sha256={'é' * 64}").status_code == 401
        assert post(CONFIRMED, "garbage").status_code == 401

    def test_rejects_other_prefixes(self):
        assert post(CONFIRMED, f"v1={hex_for(CONFIRMED)}").status_code == 401
        assert post(CONFIRMED, f"sha1={hex_for(CONFIRMED)}").status_code == 401


class TestEvents:
    @pytest.mark.parametrize(
        "event_type,data,handled",
        [
            ("subscriber.created", IDS, True),
            ("subscriber.confirmed", IDS, True),
            ("subscriber.unsubscribed", IDS, True),
            ("email.sent", {"newsletter": IDS["newsletter"], "email": "e1"}, True),
            ("automation.invoked", {"newsletter": IDS["newsletter"]}, True),
            ("subscriber.paid", IDS, False),
        ],
    )
    def test_dispatches_on_event_type(self, caplog, event_type, data, handled):
        body = payload(event_type, data)
        with caplog.at_level(logging.INFO, logger="buttondown-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        assert ("Unhandled event" not in caplog.text) is handled

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_rejects_verified_non_object_json(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
