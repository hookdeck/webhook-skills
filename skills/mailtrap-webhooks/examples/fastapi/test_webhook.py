# Generated with: mailtrap-webhooks skill
# https://github.com/hookdeck/webhook-skills

"""Tests for the Mailtrap webhook receiver.

Signatures use Mailtrap's algorithm: lowercase hex HMAC-SHA256 of the RAW body,
keyed with the signing secret as plain UTF-8 text.
"""

import hashlib
import hmac
import json
import os

import pytest

SECRET = "0123456789abcdef0123456789abcdef"  # 32 hex chars, used as plain text
# Must be in the environment before main.py reads it.
os.environ["MAILTRAP_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, parse_events, verify_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


DELIVERY = {
    "event": "delivery",
    "timestamp": 1728669700,
    "sending_stream": "transactional",
    "message_id": "1df37d17-0286-4d8b-8edf-bc4ec5be86e6",
    "email": "receiver@example.com",
    "event_id": "bede7236-2284-43d6-a953-1fdcafd0fdbc",
    "sending_domain_name": "examplesender.com",
}
JSON_BODY = json.dumps({"events": [DELIVERY]}).encode()
JSONL_BODY = (json.dumps(DELIVERY) + "\n" + json.dumps({**DELIVERY, "event": "open", "event_id": "e2"}) + "\n").encode()


def post(body: bytes, sig=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if sig is not None:
        headers["Mailtrap-Signature"] = sig
    return client.post("/webhooks/mailtrap", content=body, headers=headers)


class TestVerifySignature:
    def test_valid_and_uppercase(self):
        assert verify_signature(JSON_BODY, sign(JSON_BODY), SECRET)
        assert verify_signature(JSON_BODY, sign(JSON_BODY).upper(), SECRET)

    def test_secret_is_plain_text_not_hex_decoded(self):
        decoded = hmac.new(bytes.fromhex(SECRET), JSON_BODY, hashlib.sha256).hexdigest()
        assert not verify_signature(JSON_BODY, decoded, SECRET)

    def test_rejects_wrong_secret_tampered_and_reserialised(self):
        assert not verify_signature(JSON_BODY, sign(JSON_BODY, "f" * 32), SECRET)
        assert not verify_signature(JSON_BODY + b" ", sign(JSON_BODY), SECRET)
        pretty = json.dumps(json.loads(JSON_BODY), indent=2).encode()
        assert not verify_signature(pretty, sign(JSON_BODY), SECRET)

    @pytest.mark.parametrize("bad", ["", "abc", "zz" * 32, "é" * 64])
    def test_rejects_malformed_without_raising(self, bad):
        assert not verify_signature(JSON_BODY, bad, SECRET)


class TestParseEvents:
    def test_json_jsonl_and_single_line(self):
        assert parse_events(JSON_BODY) == [DELIVERY]
        assert len(parse_events(JSONL_BODY)) == 2
        assert parse_events(json.dumps(DELIVERY).encode()) == [DELIVERY]

    def test_garbage_raises(self):
        with pytest.raises(ValueError):
            parse_events(b"not json")


class TestEndpoint:
    def test_valid_json(self):
        res = post(JSON_BODY, sign(JSON_BODY))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_jsonl_and_any_content_type(self):
        assert post(JSONL_BODY, sign(JSONL_BODY), "application/jsonl").status_code == 200
        assert post(JSON_BODY, sign(JSON_BODY), "text/plain").status_code == 200

    def test_all_event_types(self):
        names = ["delivery", "open", "click", "unsubscribe", "spam", "soft bounce", "bounce", "suspension", "reject"]
        events = [{**DELIVERY, "event": n, "event_id": f"x{i}"} for i, n in enumerate(names)]
        events.append({"event": "activity_log.user.login", "description": "logged in", "actor": {"id": 1}, "timestamp": 1})
        body = json.dumps({"events": events}).encode()
        assert post(body, sign(body)).status_code == 200

    def test_invalid_signature_401(self):
        assert post(JSON_BODY, sign(JSON_BODY, "f" * 32)).status_code == 401
        assert post(JSON_BODY, "abc").status_code == 401
        assert post(JSON_BODY, "zz" * 32).status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/mailtrap",
            content=JSON_BODY,
            headers=[("Content-Type", "application/json"), ("Mailtrap-Signature", "é".encode("latin-1"))],
        )
        assert res.status_code == 401

    def test_missing_header_400(self):
        assert post(JSON_BODY).status_code == 400

    def test_malformed_payload_400(self):
        body = b"not json at all"
        assert post(body, sign(body)).status_code == 400
