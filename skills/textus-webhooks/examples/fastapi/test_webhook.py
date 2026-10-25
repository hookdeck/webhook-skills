import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set before importing the app. TextUs secrets look like `textus-<random>`.
SECRET = "textus-HOTh4kXxHIbYst0xutpkdw"
os.environ["TEXTUS_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Bare hex HMAC-SHA256 of the raw body, keyed with the whole secret string."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def post(payload: bytes, signature=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-TextUs-Signature"] = signature
    return client.post("/webhooks/textus", content=payload, headers=headers)


PAYLOAD = json.dumps(
    {"action": "message.received", "timestamp": "2026-10-20T18:38:00Z", "message": {"id": "msg_1"}}
).encode()


def test_missing_signature_returns_401():
    assert post(PAYLOAD).status_code == 401


def test_short_signature_returns_401():
    assert post(PAYLOAD, "deadbeef").status_code == 401


def test_non_hex_signature_returns_401():
    assert post(PAYLOAD, "z" * 64).status_code == 401


def test_non_ascii_signature_returns_401_not_500():
    # Raw UTF-8 header bytes: compare_digest on a non-ASCII str would TypeError (500).
    assert post(PAYLOAD, ("é" * 64).encode("utf-8")).status_code == 401


def test_wrong_secret_returns_401():
    assert post(PAYLOAD, sign(PAYLOAD, "textus-other-secret")).status_code == 401


def test_stripped_prefix_key_returns_401():
    assert post(PAYLOAD, sign(PAYLOAD, "HOTh4kXxHIbYst0xutpkdw")).status_code == 401


def test_tampered_payload_returns_401():
    assert post(PAYLOAD.replace(b"msg_1", b"msg_2"), sign(PAYLOAD)).status_code == 401


def test_valid_signature_returns_200():
    response = post(PAYLOAD, sign(PAYLOAD))
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_uppercase_hex_signature_accepted():
    assert post(PAYLOAD, sign(PAYLOAD).upper()).status_code == 200


def test_any_content_type_verifies():
    assert post(PAYLOAD, sign(PAYLOAD), "text/plain").status_code == 200


def test_signed_non_json_returns_400():
    assert post(b"not json", sign(b"not json")).status_code == 400


def test_signed_json_array_returns_400():
    assert post(b"[]", sign(b"[]")).status_code == 400


@pytest.mark.parametrize(
    "action",
    [
        "message.received",
        "message.delivered",
        "message.failed",
        "message.unknown",
        "phone_call.completed",
        "contact.opted_out",
        "contact.opted_in",
        "contact.created",
        "something.else",
    ],
)
def test_handles_event(action):
    body = json.dumps({"action": action, "timestamp": "2026-10-20T18:38:00Z"}).encode()
    assert post(body, sign(body)).status_code == 200


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
