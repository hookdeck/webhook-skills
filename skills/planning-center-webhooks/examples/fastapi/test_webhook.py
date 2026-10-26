import hashlib
import hmac
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Worked example from the Authenticity section of the Planning Center docs
DOC_SECRET = "2608ab74db02d670279278a90585fca300953f0a19fd96529cb61bb92ed39d86"
DOC_SIGNATURE = "a0782fde663e7ee25a99b9d44f45434120ff027ba98ef333a83a4590fcc97828"
# The docs show the body as a Ruby single-quoted string; this file holds the real bytes
DOC_BODY = (Path(__file__).parent / "fixtures" / "authenticity-example.json").read_bytes()

os.environ["PLANNING_CENTER_AUTHENTICITY_SECRET"] = DOC_SECRET
from main import app, verify_planning_center  # noqa: E402

client = TestClient(app)
HEADER = "X-PCO-Webhooks-Authenticity"


def sign(body: bytes, secret: str = DOC_SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/planning-center",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def test_reproduces_documented_signature():
    assert sign(DOC_BODY) == DOC_SIGNATURE


def test_accepts_documented_example():
    res = post(DOC_BODY, {HEADER: DOC_SIGNATURE})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_any_content_type():
    assert post(DOC_BODY, {HEADER: DOC_SIGNATURE}, content_type="text/plain").status_code == 200


def test_accepts_uppercase_signature():
    assert post(DOC_BODY, {HEADER: DOC_SIGNATURE.upper()}).status_code == 200


def test_parses_nested_payload(capsys):
    post(DOC_BODY, {HEADER: DOC_SIGNATURE})
    assert "Person updated (attempt 1): 125587227 Kid 222" in capsys.readouterr().out


def test_rejects_missing_header():
    assert post(DOC_BODY).status_code == 400


def test_rejects_wrong_signature():
    assert post(DOC_BODY, {HEADER: "a" * 64}).status_code == 401


def test_rejects_tampered_body():
    tampered = DOC_BODY.replace(b"Kid 222", b"Kid 333")
    assert post(tampered, {HEADER: DOC_SIGNATURE}).status_code == 401


def test_rejects_signature_with_hex_decoded_secret():
    wrong = hmac.new(bytes.fromhex(DOC_SECRET), DOC_BODY, hashlib.sha256).hexdigest()
    assert post(DOC_BODY, {HEADER: wrong}).status_code == 401


@pytest.mark.parametrize("bad", ["short", "z" * 64, DOC_SIGNATURE + "00"])
def test_rejects_malformed_signatures(bad):
    assert post(DOC_BODY, {HEADER: bad}).status_code == 401


def test_non_ascii_header_is_401_not_500():
    res = client.post(
        "/webhooks/planning-center",
        content=DOC_BODY,
        headers={HEADER.encode(): "é".encode("latin-1")},
    )
    assert res.status_code == 401


def test_invalid_json_with_valid_signature_is_400():
    body = b"not json"
    assert post(body, {HEADER: sign(body)}).status_code == 400


def test_acknowledges_unhandled_event_names():
    body = (
        b'{"data":[{"id":"x","type":"EventDelivery",'
        b'"attributes":{"name":"people.v2.events.other.thing","attempt":2,"payload":"{}"}}]}'
    )
    assert post(body, {HEADER: sign(body)}).status_code == 200


def test_verify_rejects_missing_secret():
    assert verify_planning_center(DOC_BODY, DOC_SIGNATURE, None) is False
