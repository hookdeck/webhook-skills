import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

SECRET = "test_autosana_signing_secret"
os.environ["AUTOSANA_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)
HEADER = "X-Autosana-Signature-256"


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def payload(event: str = "batch.completed") -> bytes:
    return json.dumps({
        "event": event,
        "timestamp": "2025-01-31T12:34:56.789Z",
        "app": {"id": "com.example.myapp", "bundle_id": "com.example.myapp", "name": "My App", "platform": "android"},
        "git": {"commit_sha": "a1b2c3d4e5f6", "branch": "main"},
        "summary": {"total_groups": 3, "passed_groups": 2, "failed_groups": 1},
        "run_groups": [{
            "name": "Login Suite",
            "status": "passed",
            "url": "https://autosana.ai/runs/groups/f1e2d3c4",
            "runs": [{"name": "User can sign in with email", "status": "passed", "url": "https://autosana.ai/runs/flow/1234"}],
        }],
    }).encode()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/autosana",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


def test_valid_batch_completed():
    body = payload()
    res = post(body, {HEADER: sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_any_content_type():
    body = payload()
    res = post(body, {"content-type": "text/plain", HEADER: sign(body)})
    assert res.status_code == 200


def test_uppercase_hex_digest():
    body = payload()
    upper = "sha256=" + sign(body)[len("sha256="):].upper()
    assert post(body, {HEADER: upper}).status_code == 200


def test_unhandled_event_with_valid_signature():
    body = payload("batch.started")
    assert post(body, {HEADER: sign(body)}).status_code == 200


def test_missing_signature():
    assert post(payload()).status_code == 400


def test_wrong_secret():
    body = payload()
    assert post(body, {HEADER: sign(body, "wrong")}).status_code == 400


def test_tampered_body():
    body = payload()
    tampered = body.replace(b"My App", b"Other App")
    assert post(tampered, {HEADER: sign(body)}).status_code == 400


def test_missing_prefix():
    body = payload()
    assert post(body, {HEADER: sign(body)[len("sha256="):]}).status_code == 400


def test_non_ascii_signature_is_rejected_not_500():
    body = payload()
    res = post(body, {HEADER: "sha256=é".encode("utf-8")})
    assert res.status_code == 400


def test_wrong_length_digest():
    body = payload()
    assert post(body, {HEADER: sign(body)[:-2]}).status_code == 400


def test_invalid_json_with_valid_signature():
    body = b"not json"
    assert post(body, {HEADER: sign(body)}).status_code == 400
