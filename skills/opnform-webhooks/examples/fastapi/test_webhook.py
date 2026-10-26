import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# OpnForm webhook secrets are chosen by the user (12+ characters); this one is only for tests
SECRET = "test_opnform_secret_5f0c1a7e"
os.environ["OPNFORM_WEBHOOK_SECRET"] = SECRET

from main import app, verify_opnform  # noqa: E402

client = TestClient(app)

# Based on the submission sample in OpnForm's webhook docs
PAYLOAD = {
    "form_id": 123,
    "form_title": "Contact Form",
    "form_slug": "contact-form",
    "submission_id": 456,
    "edit_link": "https://opnform.com/forms/contact-form?submission_id=example",
    "submission": {"Name": "Jane Doe"},
    "data": {"field-id": {"value": "Jane Doe", "name": "Name", "type": "text"}},
    "meta": {"attribution": {"utm_source": "newsletter", "utm_campaign": "summer-launch"}},
}
BODY = json.dumps(PAYLOAD)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("OPNFORM_WEBHOOK_SECRET", SECRET)


def digest(body: str, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def sign(body: str, secret: str = SECRET) -> str:
    """Matches OpnForm's header format: sha256=<hex>."""
    return f"sha256={digest(body, secret)}"


def post(body, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Webhook-Signature"] = signature
    return client.post("/webhooks/opnform", content=body, headers=headers)


def test_accepts_valid_prefixed_signature():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_bare_digest():
    assert post(BODY, digest(BODY)).status_code == 200


def test_accepts_uppercase_hex():
    assert post(BODY, f"sha256={digest(BODY).upper()}").status_code == 200


def test_verifies_any_content_type_against_raw_bytes():
    assert post(BODY, sign(BODY), content_type="text/plain").status_code == 200


def test_verifies_exact_bytes_not_reserialized_body():
    pretty = json.dumps(PAYLOAD, indent=2)
    assert post(pretty, sign(pretty)).status_code == 200
    assert post(pretty, sign(BODY)).status_code == 401


def test_rejects_missing_signature():
    assert post(BODY).status_code == 401


def test_rejects_empty_signature():
    assert post(BODY, "").status_code == 401


def test_rejects_wrong_secret():
    assert post(BODY, sign(BODY, "another_secret_value")).status_code == 401


def test_rejects_tampered_body():
    tampered = json.dumps({**PAYLOAD, "submission_id": 457})
    assert post(tampered, sign(BODY)).status_code == 401


@pytest.mark.parametrize(
    "header",
    [
        "sha256=",
        "sha256=abcd",
        "sha256=" + "0" * 66,
        "sha256=" + "z" * 64,
        "sha1=" + "0" * 64,
        "sha256=" + "é" * 64,
    ],
)
def test_rejects_malformed_signature(header):
    # Header values go on the wire as latin-1, so the non-ASCII case is encoded explicitly
    res = client.post(
        "/webhooks/opnform",
        content=BODY,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": header.encode("latin-1")},
    )
    assert res.status_code == 401


def test_rejects_base64_digest():
    import base64

    raw = hmac.new(SECRET.encode(), BODY.encode(), hashlib.sha256).digest()
    assert post(BODY, "sha256=" + base64.b64encode(raw).decode()).status_code == 401


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("OPNFORM_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500


def test_returns_400_for_signed_non_json():
    assert post("not json", sign("not json")).status_code == 400


@pytest.mark.parametrize("raw", ["[1,2]", "null", '"hi"'])
def test_returns_400_for_signed_non_object_json(raw):
    assert post(raw, sign(raw)).status_code == 400


def test_wrong_typed_fields_do_not_500():
    odd = json.dumps(
        {
            "form_id": {"a": 1},
            "form_title": 42,
            "submission_id": [1],
            "submission": "a string",
            "data": [],
            "meta": "x",
        }
    )
    assert post(odd, sign(odd)).status_code == 200


def test_empty_object_does_not_500():
    assert post("{}", sign("{}")).status_code == 200


def test_verify_function_edge_cases():
    raw = BODY.encode()
    assert verify_opnform(raw, sign(BODY), "") is False
    assert verify_opnform(raw, None, SECRET) is False
    # The secret is UTF-8 bytes, not hex-decoded
    hexish = "abcdef0123456789abcdef"
    wrong = "sha256=" + hmac.new(bytes.fromhex(hexish), raw, hashlib.sha256).hexdigest()
    assert verify_opnform(raw, wrong, hexish) is False
    assert verify_opnform(raw, sign(BODY, hexish), hexish) is True


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
