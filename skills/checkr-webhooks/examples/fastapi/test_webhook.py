# Generated with: checkr-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

import pytest

# Synthetic key: in production this is your oldest secret API key
# (or your Partner app's client secret).
KEY = "checkr_synthetic_test_key_4f1c9a2b7d"
os.environ["CHECKR_SIGNING_KEY"] = KEY

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_checkr_signature  # noqa: E402

client = TestClient(app)

BODY = '{"id":"6a1f0c2b9e3d4a5b6c7d8e9f","object":"event","type":"report.completed","created_at":"2026-11-18T10:15:00Z","webhook_url":"https://example.com/webhooks/checkr","data":{"object":{"id":"4722c07dd9a10c3985ae432a","object":"report","status":"complete","result":"clear","package":"driver_pro"}}}'
CANDIDATE_BODY = '{"id":"7b2e1d3c0f4e5b6a7d8c9e0f","object":"event","type":"candidate.created","created_at":"2026-11-18T10:16:00Z","webhook_url":"https://example.com/webhooks/checkr","data":{"object":{"id":"c373384e71a9a02098cb7421","object":"candidate","uri":"/v1/candidates/c373384e71a9a02098cb7421"}}}'


def sign(body, key=KEY):
    return hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-Checkr-Signature"] = signature
    return client.post("/webhooks/checkr", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("CHECKR_SIGNING_KEY", KEY)


def test_checkr_published_test_vector():
    body = '{"monday":"75F","tuesday":"80F"}'
    signature = "b7412f05e981a473b5ecbdb5393afaea02a679db6d7c8e56803512ec4ba98151"
    assert verify_checkr_signature(body, signature, "test-secret")
    assert not verify_checkr_signature(body, signature, "other-secret")


def test_placeholder_for_accounts_without_api_key_is_rejected():
    placeholder = "Please create an API key to check the authenticity of our webhooks."
    assert not verify_checkr_signature(BODY, placeholder, KEY)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "report.completed", "id": "6a1f0c2b9e3d4a5b6c7d8e9f"}


def test_other_event_types_are_handled():
    res = post(CANDIDATE_BODY, sign(CANDIDATE_BODY))
    assert res.status_code == 200
    assert res.json()["type"] == "candidate.created"


def test_other_key_is_rejected():
    assert post(BODY, sign(BODY, "some_other_api_key")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"clear"', '"consider"'), sign(BODY)).status_code == 401


def test_pretty_printed_json_is_rejected():
    pretty = json.dumps(json.loads(BODY), indent=2)
    assert post(pretty, sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_key_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("CHECKR_SIGNING_KEY", KEY + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_key(monkeypatch):
    monkeypatch.delenv("CHECKR_SIGNING_KEY")
    assert post(BODY, sign(BODY)).status_code == 500
