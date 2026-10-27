import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

os.environ["PARTNERO_WEBHOOK_SECRET"] = "partnero_test_signing_secret"

from main import app, verify_partnero_signature  # noqa: E402

SECRET = os.environ["PARTNERO_WEBHOOK_SECRET"]
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# Shape from Partnero's documented partner.created payload
PARTNER_CREATED = json.dumps(
    {
        "event": "partner.created",
        "url": "https://your-server.com/webhooks/partnero",
        "webhook_key": "wh_abc123",
        "created_at": "2025-01-15T10:30:00.000000Z",
        "data": {
            "id": "partner_abc123",
            "email": "partner@partnero.com",
            "name": "John",
            "surname": "Doe",
            "status": "approved",
            "created_at": "2025-01-15T10:30:00.000000Z",
            "metadata": {},
        },
    }
).encode()

# PHP's json_encode escapes slashes and non-ASCII; the signature covers these exact bytes
PHP_ENCODED = (
    b'{"event":"transaction.created","url":"https:\\/\\/your-server.com\\/webhooks\\/partnero",'
    b'"webhook_key":"wh_abc123","created_at":"2025-01-15T14:22:00.000000Z",'
    b'"data":{"key":"txn_123","amount":99.99,"currency":"USD","action":"sale","note":"caf\\u00e9"}}'
)


def post(body: bytes, headers: dict | None = None, content_type: str = "application/json"):
    return client.post(
        "/webhooks/partnero",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


class TestVerify:
    def test_valid(self):
        assert verify_partnero_signature(PARTNER_CREATED, sign(PARTNER_CREATED), SECRET)

    def test_uppercase_hex(self):
        assert verify_partnero_signature(PARTNER_CREATED, sign(PARTNER_CREATED).upper(), SECRET)

    def test_invalid_variants(self):
        good = sign(PARTNER_CREATED)
        assert not verify_partnero_signature(PARTNER_CREATED, sign(PARTNER_CREATED, "other"), SECRET)
        assert not verify_partnero_signature(PARTNER_CREATED, None, SECRET)
        assert not verify_partnero_signature(PARTNER_CREATED, "", SECRET)
        assert not verify_partnero_signature(PARTNER_CREATED, "abcd", SECRET)
        assert not verify_partnero_signature(PARTNER_CREATED, good + "00", SECRET)
        assert not verify_partnero_signature(PARTNER_CREATED, "zz" * 32, SECRET)
        assert not verify_partnero_signature(PARTNER_CREATED, "sha256=" + good, SECRET)
        assert not verify_partnero_signature(PARTNER_CREATED, "é" * 64, SECRET)


class TestEndpoint:
    def test_valid_partner_created(self):
        res = post(PARTNER_CREATED, {"Signature": sign(PARTNER_CREATED)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_exact_bytes_are_verified(self):
        assert post(PHP_ENCODED, {"Signature": sign(PHP_ENCODED)}).status_code == 200
        reserialised = json.dumps(json.loads(PHP_ENCODED)).encode()
        assert post(PHP_ENCODED, {"Signature": sign(reserialised)}).status_code == 401

    def test_any_content_type(self):
        res = post(PARTNER_CREATED, {"Signature": sign(PARTNER_CREATED)}, "text/plain")
        assert res.status_code == 200

    def test_unknown_event_returns_200(self):
        body = json.dumps({"event": "customer.updated", "data": {"id": "cust_1"}}).encode()
        assert post(body, {"Signature": sign(body)}).status_code == 200

    def test_missing_signature(self):
        assert post(PARTNER_CREATED).status_code == 401

    def test_invalid_signature(self):
        assert post(PARTNER_CREATED, {"Signature": "a" * 64}).status_code == 401

    def test_tampered_body(self):
        tampered = PARTNER_CREATED.replace(b"John", b"Jane")
        assert post(tampered, {"Signature": sign(PARTNER_CREATED)}).status_code == 401

    def test_signed_non_json_body(self):
        body = b"not json"
        assert post(body, {"Signature": sign(body)}).status_code == 400
