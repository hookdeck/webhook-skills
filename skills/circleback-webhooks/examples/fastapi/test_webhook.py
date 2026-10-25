import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

SIGNING_SECRET = "test_circleback_signing_secret"

from main import app  # noqa: E402

client = TestClient(app)

MEETING = {
    "id": "WRweb12iCBimU6Vo8cD7z",
    "name": "Event Venue Review",
    "createdAt": "2023-07-25T20:30:57.926Z",
    "duration": 1306.09,
    "url": "https://meet.google.com/abc-defgh-xyz",
    "recordingUrl": None,
    "tags": ["Events"],
    "attendees": [{"name": "John Appleseed", "email": "john@example.com"}],
    "notes": "#### Overview\n*   Several options for event venues were reviewed...",
    "actionItems": [
        {"id": 252, "title": "Contact event venues", "description": "Reach out.", "assignee": None, "status": "PENDING"}
    ],
    "transcript": [{"speaker": "John Appleseed", "text": "Hey, how's it going?", "timestamp": 4.56}],
}
BODY = json.dumps(MEETING).encode()


def sign(body: bytes, secret: str = SIGNING_SECRET) -> str:
    """Sign exactly as Circleback does: hex(HMAC-SHA256(secret, raw body))."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers: dict | None = None):
    return client.post("/webhooks/circleback", content=body, headers=headers or {})


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("CIRCLEBACK_SIGNING_SECRET", SIGNING_SECRET)


def test_accepts_valid_signature():
    res = post(BODY, {"content-type": "application/json", "x-signature": sign(BODY)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_uppercase_hex():
    res = post(BODY, {"x-signature": sign(BODY).upper()})
    assert res.status_code == 200


def test_verifies_any_content_type():
    res = post(BODY, {"content-type": "text/plain", "x-signature": sign(BODY)})
    assert res.status_code == 200


def test_rejects_wrong_signature():
    res = post(BODY, {"x-signature": sign(BODY, "other_secret")})
    assert res.status_code == 401


def test_rejects_tampered_body():
    res = post(BODY.replace(b"Event Venue Review", b"Tampered"), {"x-signature": sign(BODY)})
    assert res.status_code == 401


def test_rejects_missing_signature_header():
    assert post(BODY).status_code == 401


def test_rejects_wrong_length_signature():
    assert post(BODY, {"x-signature": sign(BODY)[:32]}).status_code == 401


def test_rejects_non_hex_signature_of_correct_length():
    assert post(BODY, {"x-signature": "g" + sign(BODY)[1:]}).status_code == 401


def test_rejects_signature_with_trailing_junk():
    assert post(BODY, {"x-signature": sign(BODY) + "zz"}).status_code == 401


def test_non_ascii_signature_header_is_401_not_500():
    res = post(BODY, {"x-signature": "é".encode("latin-1") * 64})
    assert res.status_code == 401


def test_invalid_json_with_valid_signature_is_400():
    bad = b"{not json"
    assert post(bad, {"x-signature": sign(bad)}).status_code == 400


def test_missing_secret_is_500(monkeypatch):
    monkeypatch.delenv("CIRCLEBACK_SIGNING_SECRET")
    assert post(BODY, {"x-signature": sign(BODY)}).status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
