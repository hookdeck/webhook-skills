import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "pLjUpNQu8a4YjeCrf2KseA"
os.environ["DOJAH_WEBHOOK_SECRET"] = SECRET

from main import app, verify_dojah_signature  # noqa: E402

client = TestClient(app)

STATUSES = ["Ongoing", "Pending", "Completed", "Failed", "Abandoned"]


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def payload(verification_status: str, status: bool = True) -> bytes:
    return json.dumps(
        {
            "reference_id": "DJ-92F24FA662",
            "verification_status": verification_status,
            "status": status,
            "data": {"selfie": {"status": True}},
        }
    ).encode()


def post(body: bytes, signature=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["x-dojah-signature"] = signature
    return client.post("/webhooks/dojah", content=body, headers=headers)


@pytest.mark.parametrize("verification_status", STATUSES)
def test_accepts_valid_signature(verification_status):
    body = payload(verification_status)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_completed_with_status_false_is_not_passed(capsys):
    body = payload("Completed", status=False)
    assert post(body, sign(body)).status_code == 200
    assert "Verification completed but not passed: DJ-92F24FA662" in capsys.readouterr().out


def test_verifies_regardless_of_content_type():
    body = payload("Completed")
    assert post(body, sign(body), content_type="text/plain").status_code == 200


def test_accepts_uppercase_hex_signature():
    body = payload("Completed")
    assert post(body, sign(body).upper()).status_code == 200


def test_acknowledges_events_without_verification_status():
    body = json.dumps({"event": "sms.delivered"}).encode()
    assert post(body, sign(body)).status_code == 200


def test_ignores_wrong_typed_fields():
    body = json.dumps(
        {"reference_id": {"a": 1}, "verification_status": ["Completed"], "status": "yes", "data": 5}
    ).encode()
    assert post(body, sign(body)).status_code == 200


def test_rejects_missing_signature_header():
    assert post(payload("Completed")).status_code == 401


def test_rejects_empty_signature_header():
    assert post(payload("Completed"), "").status_code == 401


def test_rejects_wrong_secret():
    body = payload("Completed")
    assert post(body, sign(body, "wrong-secret")).status_code == 401


def test_rejects_tampered_body():
    assert post(payload("Failed"), sign(payload("Completed"))).status_code == 401


@pytest.mark.parametrize(
    "signature",
    [
        "abc123",
        "z" * 64,
        sign(b"x")[:60] + "zzzz",
        "sha256=" + sign(b"x"),
        "é" * 64,
    ],
)
def test_rejects_malformed_signature(signature):
    # Non-ASCII header values must give 401, never a 500
    res = client.post(
        "/webhooks/dojah",
        content=payload("Completed"),
        headers={"Content-Type": "application/json", "x-dojah-signature": signature.encode("latin-1")},
    )
    assert res.status_code == 401


def test_rejects_invalid_json_that_is_correctly_signed():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400


@pytest.mark.parametrize("body", [b"[1,2]", b'"text"', b"null", b"7"])
def test_rejects_signed_non_object_body(body):
    assert post(body, sign(body)).status_code == 400


def test_verify_signs_bytes_exactly_as_received():
    body = b'{ "b": 1,  "a": 2 }'
    assert verify_dojah_signature(body, sign(body), SECRET)
    assert not verify_dojah_signature(b'{"b":1,"a":2}', sign(body), SECRET)


def test_verify_rejects_without_secret():
    assert not verify_dojah_signature(b"{}", sign(b"{}"), "")
