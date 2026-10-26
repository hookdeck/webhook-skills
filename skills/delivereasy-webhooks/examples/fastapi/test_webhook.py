import base64
import hashlib
import hmac
import json
import os

os.environ["DELIVEREASY_WEBHOOK_SECRET"] = "test_api_key_for_delivereasy"

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_delivereasy  # noqa: E402

SECRET = os.environ["DELIVEREASY_WEBHOOK_SECRET"]
client = TestClient(app)

BODY = json.dumps(
    {
        "id": 12345,
        "booking_identifier": "ABC123",
        "status": "example_status",
        "driver": {"name": "Sam"},
        "pickup": {},
        "dropoff": {},
    }
).encode()


def sign(body: bytes, secret: str = SECRET) -> str:
    # Same algorithm as Delivereasy: Base64.strict_encode64(HMAC-SHA256(api_key, body))
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def post(body: bytes, headers=None, content_type="application/json"):
    h = {"Content-Type": content_type}
    h.update(headers or {})
    return client.post("/webhooks/delivereasy", content=body, headers=h)


def test_accepts_valid_signature():
    assert post(BODY, {"X-Signature": sign(BODY)}).status_code == 200


def test_accepts_any_content_type():
    assert post(BODY, {"X-Signature": sign(BODY)}, "text/plain").status_code == 200


def test_verifies_exact_bytes():
    spaced = b'{ "id": 1,  "status": "x" }'
    assert post(spaced, {"X-Signature": sign(spaced)}).status_code == 200
    reserialized = json.dumps(json.loads(spaced)).encode()
    assert post(spaced, {"X-Signature": sign(reserialized)}).status_code == 401


def test_rejects_missing_signature():
    assert post(BODY).status_code == 401


def test_rejects_empty_signature():
    assert post(BODY, {"X-Signature": ""}).status_code == 401


def test_rejects_wrong_key():
    assert post(BODY, {"X-Signature": sign(BODY, "other_key")}).status_code == 401


def test_rejects_tampered_body():
    assert post(BODY.replace(b"ABC123", b"XYZ999"), {"X-Signature": sign(BODY)}).status_code == 401


def test_rejects_malformed_signatures():
    for sig in ["not-base64", sign(BODY)[:-1], "sha256=" + sign(BODY)]:
        assert post(BODY, {"X-Signature": sig}).status_code == 401


def test_rejects_non_ascii_signature_without_error():
    assert verify_delivereasy(BODY, "é" * 44, SECRET) is False


def test_rejects_non_canonical_base64():
    good = sign(BODY)
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    idx = alphabet.index(good[42])
    forged = good[:42] + alphabet[(idx & ~3) | (((idx & 3) + 1) % 4)] + "="
    assert base64.b64decode(forged, validate=True) == base64.b64decode(good, validate=True)
    assert verify_delivereasy(BODY, forged, SECRET) is False
    assert verify_delivereasy(BODY, good, SECRET) is True


def test_rejects_trailing_newline_in_signature():
    assert verify_delivereasy(BODY, sign(BODY) + "\n", SECRET) is False


def test_non_json_body_is_400():
    assert post(b"not json", {"X-Signature": sign(b"not json")}).status_code == 400
