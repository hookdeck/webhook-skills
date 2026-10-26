import hashlib
import hmac
import itertools
import os

# Holded secrets look like whsec_... but the whole string (prefix included) is
# the plain HMAC key. It is not base64-decoded and not Standard Webhooks.
SECRET = "whsec_3b1f8a0c2d4e6f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f708"
os.environ["HOLDED_WEBHOOK_SECRET"] = SECRET

import base64

from fastapi.testclient import TestClient

from main import app, verify_holded_signature

client = TestClient(app)

PAYLOAD = '{"id": "64f0c0a1b2c3d4e5f6a7b8c9", "docNumber": "F230001"}'
_ids = itertools.count(1)


def sign(payload: str, secret: str | bytes = SECRET) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode("utf-8")
    return "sha256=" + hmac.new(key, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body: str, **headers):
    base = {
        "content-type": "application/json",
        "x-holded-webhook-event": "invoice.create",
        "x-holded-webhook-id": f"evt_{next(_ids)}",
        "x-holded-webhook-date": "2026-06-18T11:10:35Z",
    }
    base.update({k.replace("_", "-"): v for k, v in headers.items()})
    return client.post("/webhooks/holded", content=body.encode("utf-8"), headers=base)


class TestVerifyHoldedSignature:
    def test_accepts_valid_signature(self):
        assert verify_holded_signature(PAYLOAD.encode(), sign(PAYLOAD), SECRET) == (True, None)

    def test_accepts_uppercase_hex(self):
        header = "sha256=" + sign(PAYLOAD)[7:].upper()
        assert verify_holded_signature(PAYLOAD.encode(), header, SECRET)[0]

    def test_rejects_missing_header(self):
        assert not verify_holded_signature(PAYLOAD.encode(), None, SECRET)[0]

    def test_rejects_missing_prefix(self):
        assert not verify_holded_signature(PAYLOAD.encode(), sign(PAYLOAD)[7:], SECRET)[0]

    def test_rejects_wrong_length_and_non_hex(self):
        good = sign(PAYLOAD)[7:]
        for bad in ("sha256=abcd", "sha256=" + "z" * 64, "sha256=" + good + "zz"):
            assert not verify_holded_signature(PAYLOAD.encode(), bad, SECRET)[0]

    def test_non_ascii_header_is_rejected_not_an_error(self):
        assert not verify_holded_signature(PAYLOAD.encode(), "sha256=" + "é" * 64, SECRET)[0]

    def test_rejects_stripped_or_decoded_secret(self):
        stripped = SECRET.removeprefix("whsec_")
        assert not verify_holded_signature(PAYLOAD.encode(), sign(PAYLOAD, stripped), SECRET)[0]
        decoded = base64.b64decode(stripped)
        assert not verify_holded_signature(PAYLOAD.encode(), sign(PAYLOAD, decoded), SECRET)[0]

    def test_rejects_tampered_body(self):
        assert not verify_holded_signature((PAYLOAD + " ").encode(), sign(PAYLOAD), SECRET)[0]


class TestWebhookEndpoint:
    def test_valid_invoice_create(self):
        res = post(PAYLOAD, x_holded_webhook_signature=sign(PAYLOAD))
        assert res.status_code == 200
        assert res.json()["received"] is True

    def test_any_content_type(self):
        res = post(PAYLOAD, content_type="text/plain", x_holded_webhook_signature=sign(PAYLOAD))
        assert res.status_code == 200

    def test_unhandled_event_returns_200(self):
        res = post(
            PAYLOAD,
            x_holded_webhook_event="warehouse.update",
            x_holded_webhook_signature=sign(PAYLOAD),
        )
        assert res.status_code == 200

    def test_duplicate_id_not_processed_twice(self):
        kwargs = dict(x_holded_webhook_id="evt_dup", x_holded_webhook_signature=sign(PAYLOAD))
        assert "duplicate" not in post(PAYLOAD, **kwargs).json()
        assert post(PAYLOAD, **kwargs).json()["duplicate"] is True

    def test_date_header_is_not_signed(self):
        res = post(
            PAYLOAD,
            x_holded_webhook_signature=sign(PAYLOAD),
            x_holded_webhook_date="1999-01-01T00:00:00Z",
        )
        assert res.status_code == 200

    def test_invalid_signature_returns_401(self):
        assert post(PAYLOAD, x_holded_webhook_signature="sha256=" + "0" * 64).status_code == 401

    def test_missing_signature_returns_401(self):
        assert post(PAYLOAD).status_code == 401

    def test_non_ascii_signature_returns_401(self):
        # Raw UTF-8 bytes on the wire: Starlette decodes them to a non-ASCII str.
        res = post(PAYLOAD, x_holded_webhook_signature=("sha256=" + "é" * 64).encode("utf-8"))
        assert res.status_code == 401

    def test_non_json_body_returns_400(self):
        bad = "not json"
        assert post(bad, x_holded_webhook_signature=sign(bad)).status_code == 400
