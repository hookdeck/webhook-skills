# Generated with: merge-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

KEY = "merge_synthetic_signature_key_8Rf3"  # synthetic
os.environ["MERGE_WEBHOOK_SIGNATURE_KEY"] = KEY

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_merge_signature  # noqa: E402

client = TestClient(app)

BODY = '{"hook":{"id":"cb1fe0a7-c2a1-4bd6-8cf5-57e70c7f1d53","event":"Candidate.changed","target":"https://example.com/webhooks/merge"},"linked_account":{"id":"a3602c03-aba7-4d9d-a349-dbc338504092","integration":"Workday","integration_slug":"workday","category":"ats","end_user_origin_id":"customer-42","end_user_organization_name":"Example Co","status":"COMPLETE","account_type":"PRODUCTION"},"data":{"id":"22582af6-b45e-4d34-bed6-77bb40effa97","remote_id":"97134123","first_name":"Gil","last_name":"Feig"}}'
PASSTHROUGH_BODY = '{"hook":{"id":"32b4aa43-f48f-4fe3-8d09-583fe3b33748","event":"AsyncPassthrough.resolved","target":"https://example.com/webhooks/merge"},"async_passthrough_receipt_id":"c90c595f-c62b-4b8f-946d-3fc48c84c7c5","status":"COMPLETED","data":{"method":"GET","path":"/employees/1761","status":200,"response":{"id":"1761"}}}'

# Computed with Merge's own Python, Ruby and Node samples (key "k", body "{}").
VECTOR = "rdhTsQP7zJNqGU-esV4pxP8Ir25H1dG8pPICGOMeT_8="


def sign(body, key=KEY):
    """Padded base64url, as base64.urlsafe_b64encode in Merge's Python sample."""
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode()


def post(body, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-Merge-Webhook-Signature"] = signature
    return client.post("/webhooks/merge", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("MERGE_WEBHOOK_SIGNATURE_KEY", KEY)


def test_matches_padded_output_of_merge_samples():
    assert verify_merge_signature("{}", VECTOR, "k")


def test_unpadded_signature_is_accepted():
    assert verify_merge_signature("{}", VECTOR.rstrip("="), "k")


def test_standard_base64_is_rejected():
    assert not verify_merge_signature("{}", VECTOR.replace("-", "+").replace("_", "/"), "k")


def test_valid_padded_signature_is_accepted():
    signature = sign(BODY)
    assert signature.endswith("=")
    res = post(BODY, signature)
    assert res.status_code == 200
    assert res.json() == {
        "received": True,
        "event": "Candidate.changed",
        "linked_account_id": "a3602c03-aba7-4d9d-a349-dbc338504092",
    }


def test_event_without_linked_account_is_handled():
    res = post(PASSTHROUGH_BODY, sign(PASSTHROUGH_BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event": "AsyncPassthrough.resolved", "linked_account_id": None}


def test_other_key_is_rejected():
    assert post(BODY, sign(BODY, "another_signature_key")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"Gil"', '"Bob"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_key_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("MERGE_WEBHOOK_SIGNATURE_KEY", KEY + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_key(monkeypatch):
    monkeypatch.delenv("MERGE_WEBHOOK_SIGNATURE_KEY")
    assert post(BODY, sign(BODY)).status_code == 500
