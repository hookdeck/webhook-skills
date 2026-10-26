import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

import main

SECRET = "baseten_test_secret_0123456789"

# Payloads follow the sample in https://docs.baseten.co/inference/async
SUCCESS_EVENT = {
    "request_id": "9876543210abcdef1234567890fedcba",
    "model_id": "abc123",
    "deployment_id": "def456",
    "type": "async_request_completed",
    "time": "2024-04-30T01:01:08.883423Z",
    "data": {"output": "model response here"},
    "errors": [],
}
FAILURE_EVENT = {
    **SUCCESS_EVENT,
    "data": None,
    "errors": [{"code": "MODEL_PREDICT_ERROR", "message": "Details here"}],
}

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("BASETEN_WEBHOOK_SECRET", SECRET)


def hex_sig(body: bytes, key: str = SECRET) -> str:
    return hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


def send(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-BASETEN-SIGNATURE"] = signature
    return client.post("/webhooks/baseten", content=body, headers=headers)


BODY = json.dumps(SUCCESS_EVENT).encode()


def test_accepts_valid_v1_signature():
    res = send(BODY, f"v1={hex_sig(BODY)}")
    assert res.status_code == 200
    assert res.json() == {"received": True, "outcome": "succeeded"}


def test_accepts_bare_digest():
    assert send(BODY, hex_sig(BODY)).status_code == 200


def test_accepts_uppercase_hex():
    assert send(BODY, f"v1={hex_sig(BODY).upper()}").status_code == 200


def test_accepts_any_matching_value_in_comma_separated_header():
    header = f"v1={hex_sig(BODY, 'old_secret')}, v1={hex_sig(BODY)}"
    assert send(BODY, header).status_code == 200


def test_reports_failed_request():
    body = json.dumps(FAILURE_EVENT).encode()
    res = send(body, f"v1={hex_sig(body)}")
    assert res.status_code == 200
    assert res.json()["outcome"] == "failed"


def test_verifies_exact_bytes_whatever_the_content_type():
    assert send(BODY, f"v1={hex_sig(BODY)}", "text/plain").status_code == 200


def test_acknowledges_unknown_event_types():
    body = json.dumps({**SUCCESS_EVENT, "type": "something_else"}).encode()
    res = send(body, f"v1={hex_sig(body)}")
    assert res.status_code == 200
    assert res.json()["outcome"] == "ignored"


def test_rejects_missing_and_empty_signature():
    assert send(BODY).status_code == 401
    assert send(BODY, "").status_code == 401


def test_rejects_wrong_secret():
    assert send(BODY, f"v1={hex_sig(BODY, 'wrong')}").status_code == 401


def test_rejects_tampered_body():
    sig = f"v1={hex_sig(BODY)}"
    assert send(BODY.replace(b"model response", b"tampered"), sig).status_code == 401


def test_rejects_reserialized_body():
    sig = f"v1={hex_sig(BODY)}"
    assert send(json.dumps(SUCCESS_EVENT, indent=2).encode(), sig).status_code == 401


def test_rejects_wrong_length_and_non_hex_signatures():
    assert send(BODY, "v1=abc123").status_code == 401
    assert send(BODY, f"v1={'z' * 64}").status_code == 401
    assert send(BODY, f"v1={hex_sig(BODY)}00").status_code == 401


def test_returns_400_for_signed_non_json_body():
    body = b"not json"
    assert send(body, f"v1={hex_sig(body)}").status_code == 400


def test_returns_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv("BASETEN_WEBHOOK_SECRET")
    assert send(BODY, f"v1={hex_sig(BODY)}").status_code == 500


def test_verify_handles_empty_body():
    assert main.verify_baseten_signature(b"", f"v1={hex_sig(b'')}", SECRET)
