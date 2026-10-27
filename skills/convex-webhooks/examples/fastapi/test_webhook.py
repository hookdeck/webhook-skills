import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

SECRET = "test_convex_hmac_secret"
os.environ["CONVEX_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)
HEADER = "x-webhook-signature"
NOW = 1715879172882
CONVEX = {"deployment_name": "happy-animal-123", "deployment_type": "prod", "project_name": "my-app", "project_slug": "my-app"}


def digest(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + digest(body, secret)


def sample_batch() -> bytes:
    return json.dumps([
        {"topic": "verification", "timestamp": NOW, "convex": CONVEX, "message": "Convex webhook verification"},
        {
            "topic": "console", "timestamp": NOW, "convex": CONVEX, "log_level": "LOG", "message": "'Sent message!'",
            "function": {"path": "messages:send", "request_id": "d064ef901f7ec0b7", "type": "mutation"},
        },
        {
            "topic": "function_execution", "timestamp": NOW, "convex": CONVEX, "status": "success",
            "execution_time_ms": 294,
            "function": {"path": "message:list", "request_id": "892104e63bd39d9a", "type": "query", "cached": False},
        },
        {"topic": "audit_log", "timestamp": NOW, "convex": CONVEX, "audit_log_action": "push_config", "audit_log_metadata": "{}"},
        {"topic": "scheduler_stats", "timestamp": NOW, "convex": CONVEX, "lag_seconds": 0, "num_running_jobs": 1},
        {"topic": "current_storage_usage", "timestamp": NOW, "convex": CONVEX, "total_document_size_bytes": 104857600},
    ]).encode()


def post(body: bytes, headers: dict | None = None, content_type: str = "application/json"):
    return client.post(
        "/webhooks/convex",
        content=body,
        headers={"content-type": content_type, **(headers or {})},
    )


def test_valid_batch_with_prefix():
    body = sample_batch()
    res = post(body, {HEADER: sign(body)})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_bare_digest_without_prefix():
    body = sample_batch()
    assert post(body, {HEADER: digest(body)}).status_code == 200


def test_uppercase_hex_digest():
    body = sample_batch()
    assert post(body, {HEADER: "sha256=" + digest(body).upper()}).status_code == 200


def test_any_content_type():
    body = sample_batch()
    assert post(body, {HEADER: sign(body)}, content_type="text/plain").status_code == 200


def test_exact_bytes_not_reserialized():
    body = b'[ { "topic" : "verification",  "timestamp": 1715879172882 } ]\n'
    assert post(body, {HEADER: sign(body)}).status_code == 200


def test_unhandled_topic_with_valid_signature():
    body = json.dumps([{"topic": "concurrency_stats", "timestamp": NOW, "convex": CONVEX}]).encode()
    assert post(body, {HEADER: sign(body)}).status_code == 200


def test_jsonl_body():
    body = b'{"topic":"verification","timestamp":1}\n{"topic":"audit_log","timestamp":2}\n'
    assert post(body, {HEADER: sign(body)}).status_code == 200


def test_missing_signature():
    assert post(sample_batch()).status_code == 401


def test_empty_signature():
    assert post(sample_batch(), {HEADER: ""}).status_code == 401


def test_wrong_secret():
    body = sample_batch()
    assert post(body, {HEADER: sign(body, "wrong_secret")}).status_code == 401


def test_tampered_body():
    body = sample_batch()
    tampered = body.replace(b"message:list", b"message:evil")
    assert post(tampered, {HEADER: sign(body)}).status_code == 401


def test_malformed_signatures():
    body = sample_batch()
    good = digest(body)
    for bad in ["sha256=", "sha256=zz" + good[2:], "sha256=" + good[1:], "sha256=" + good + "00", "sha1=" + good]:
        assert post(body, {HEADER: bad}).status_code == 401


def test_valid_signature_non_json_body():
    body = b"not json"
    assert post(body, {HEADER: sign(body)}).status_code == 400
