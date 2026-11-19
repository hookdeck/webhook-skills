# Generated with: kontent-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic secret
SECRET = "c3ludGhldGljLWtvbnRlbnQtd2ViaG9vay1zZWNyZXQ="
os.environ["KONTENT_AI_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_kontent_ai_signature  # noqa: E402

client = TestClient(app)

BODY = '{"notifications":[{"data":{"system":{"id":"32022d85-ee58-4655-9016-e130c375820a","name":"Synthetic article","codename":"synthetic_article","collection":"default","workflow":"default","workflow_step":"published","language":"default","type":"article","last_modified":"2026-11-18T10:15:00.0000000Z"}},"message":{"environment_id":"00000000-0000-4000-8000-000000000001","object_type":"content_item","action":"published","delivery_slot":"published"}}]}'
BODY2 = '{"notifications":[{"data":{"system":{"id":"f24e4721-f081-50ef-9a47-2ebd45b0c915","name":"hero.jpg","codename":"hero_jpg","last_modified":"2026-11-18T10:16:00.0000000Z","collection":"default"}},"message":{"environment_id":"00000000-0000-4000-8000-000000000001","object_type":"asset","action":"metadata_changed","delivery_slot":"preview"}},{"data":{"system":{"id":"121d16aa-de4b-454f-9174-e26f25f1d860","name":"Page","codename":"page","last_modified":"2026-11-18T10:16:01.0000000Z"}},"message":{"environment_id":"00000000-0000-4000-8000-000000000001","object_type":"content_type","action":"changed","delivery_slot":"preview"}}]}'


def sign(body, key=SECRET):
    if isinstance(key, str):
        key = key.encode("utf-8")
    digest = hmac.new(key, body.encode("utf-8"), hashlib.sha256).digest()
    return "" + base64.b64encode(digest).decode()


def sign_other_encoding(body, key=SECRET):
    return "" + hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def post(body, signature=None, headers=None):
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if signature is not None:
        all_headers["X-Kontent-ai-Signature"] = signature
    return client.post("/webhooks/kontent-ai", content=body.encode("utf-8"), headers=all_headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("KONTENT_AI_WEBHOOK_SECRET", SECRET)


def test_signature_over_raw_body_is_accepted():
    assert verify_kontent_ai_signature(BODY, sign(BODY), SECRET)


def test_hex_digest_is_rejected():
    assert not verify_kontent_ai_signature(BODY, sign_other_encoding(BODY), SECRET)


def test_base64_decoded_secret_is_rejected():
    digest = base64.b64encode(hmac.new(base64.b64decode(SECRET), BODY.encode(), hashlib.sha256).digest()).decode()
    assert not verify_kontent_ai_signature(BODY, digest, SECRET)


def test_crlf_body_verifies_as_sent_but_not_after_rewriting_line_endings():
    crlf = '{\r\n  "notifications": []\r\n}'
    assert verify_kontent_ai_signature(crlf, sign(crlf), SECRET)
    assert not verify_kontent_ai_signature(crlf.replace("\r\n", "\n"), sign(crlf), SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "notifications": 1}


def test_second_event_type_is_handled():
    res = post(BODY2, sign(BODY2))
    assert res.status_code == 200
    data = res.json()
    assert data["notifications"] == 2


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"action":"published"', '"action":"unpublished"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("KONTENT_AI_WEBHOOK_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("KONTENT_AI_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500
