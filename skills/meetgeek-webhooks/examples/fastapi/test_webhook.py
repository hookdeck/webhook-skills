import hashlib
import hmac
import json
import os

os.environ["MEETGEEK_WEBHOOK_SECRET"] = "mg_test_secret_key"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

SECRET = "mg_test_secret_key"
client = TestClient(app)

# Documented sample payloads
SUCCESS = json.dumps(
    {"message": "File analyzed successfully", "meeting_id": "9433976b-cfa3-4373-9afb-eb0b7a5915df"}
).encode()
FAILED = json.dumps({"message": "File analyzed failed"}).encode()


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-mg-signature"] = signature
    return client.post("/webhooks/meetgeek", content=body, headers=headers)


def test_accepts_successful_analysis():
    assert post(SUCCESS, sign(SUCCESS)).status_code == 200


def test_accepts_failed_analysis():
    assert post(FAILED, sign(FAILED)).status_code == 200


def test_accepts_uppercase_hex_signature():
    assert post(SUCCESS, sign(SUCCESS).upper()).status_code == 200


def test_verifies_any_content_type():
    assert post(SUCCESS, sign(SUCCESS), "text/plain").status_code == 200


def test_rejects_missing_signature():
    assert post(SUCCESS).status_code == 401


def test_rejects_empty_signature():
    assert post(SUCCESS, "").status_code == 401


def test_rejects_malformed_signature():
    assert post(SUCCESS, "sha256=" + sign(SUCCESS)).status_code == 401
    assert post(SUCCESS, "zz" * 32).status_code == 401
    assert post(SUCCESS, sign(SUCCESS)[2:]).status_code == 401


def test_rejects_wrong_secret():
    assert post(SUCCESS, sign(SUCCESS, "other_secret")).status_code == 401


def test_rejects_tampered_body():
    assert post(FAILED, sign(SUCCESS)).status_code == 401


def test_signed_non_json_body_is_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400
