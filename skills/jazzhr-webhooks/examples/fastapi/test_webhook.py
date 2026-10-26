import hashlib
import hmac
import json
import os

os.environ["JAZZHR_WEBHOOK_SECRET"] = "secret-key"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

SECRET = "secret-key"
DOCS_SIGNATURE = "4fdc7dcdcb02bca16c7ec4a15b9d6436de1f186e11ff155d0ab178b5aca4f30e"
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers: dict, content_type: str = "application/json"):
    return client.post("/webhooks/jazzhr", content=body, headers={"content-type": content_type, **headers})


def test_docs_worked_example_signature():
    assert sign(b'{"data":"JazzHR Verify Event"}') == DOCS_SIGNATURE


def test_accepts_signed_verify_event():
    res = post(
        b'{"data":"JazzHR Verify Event"}',
        {"X-JazzHR-Event": "VERIFY", "X-JazzHR-Signature": DOCS_SIGNATURE},
    )
    assert res.status_code == 200


def test_accepts_signed_candidate_export():
    body = json.dumps({"candidate": {"person": {"id": {"value": "c1"}}}}).encode()
    res = post(body, {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_verifies_regardless_of_content_type():
    body = b'{"candidate":{}}'
    res = post(body, {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": sign(body)}, "text/plain")
    assert res.status_code == 200


def test_accepts_uppercase_hex_signature():
    body = b'{"candidate":{}}'
    res = post(body, {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": sign(body).upper()})
    assert res.status_code == 200


def test_rejects_wrong_secret():
    body = b'{"candidate":{}}'
    res = post(body, {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": sign(body, "other")})
    assert res.status_code == 401


def test_rejects_tampered_body():
    res = post(
        b'{"candidate":{"x":1}}',
        {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": sign(b'{"candidate":{}}')},
    )
    assert res.status_code == 401


def test_rejects_missing_signature():
    res = post(b'{"candidate":{}}', {"X-JazzHR-Event": "CANDIDATE-EXPORT"})
    assert res.status_code == 401


def test_non_ascii_signature_header_is_401_not_500():
    res = post(
        b'{"candidate":{}}',
        {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": "é".encode("latin-1")},
    )
    assert res.status_code == 401


def test_rejects_malformed_signature():
    body = b'{"candidate":{}}'
    good = sign(body)
    for bad in (good[:62] + "zz", good + "ab", good[:32], "sha256=" + good):
        res = post(body, {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": bad})
        assert res.status_code == 401


def test_signed_non_json_export_is_400():
    body = b"not json"
    res = post(body, {"X-JazzHR-Event": "CANDIDATE-EXPORT", "X-JazzHR-Signature": sign(body)})
    assert res.status_code == 400
