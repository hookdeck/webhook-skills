# Generated with: samsara-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Samsara's documented sample secret key (base64, 20 bytes). Not a real credential.
SECRET = "rGoy+beNph0qGBLj6Aqoydj6SGA="
KEY = base64.b64decode(SECRET)
OTHER_KEY = hashlib.sha256(b"another-samsara-webhook").digest()
BAD_SECRET = "not base64!"
SIGNATURE_HEADER = "x-samsara-signature"
TIMESTAMP = "1731924900"

# Check vector: Samsara's sample secret with a fixed body and timestamp.
# (The sample request on Samsara's page doesn't reproduce with the sample secret.)
VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}'
VECTOR_TIMESTAMP = "1587597109"
VECTOR_SIGNATURE = "v1=1a2489e57b7e943fbdf5068de365a580265f81dc81eee464b8e4f0491bafc0d3"

# Illustrative Ping (the Test button), pretty-printed so a re-serialised body would not match.
BODY = """{
  "eventId": "8c4e2d1a-7b3f-4c9e-a2d5-0f6b8e1c3a97",
  "eventMs": 1731924900123,
  "eventType": "Ping",
  "event": {
    "text": "Ping"
  }
}"""
TAMPER_FROM = '"eventMs": 1731924900123'
TAMPER_TO = '"eventMs": 1731924900124'

os.environ["SAMSARA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_samsara_webhook  # noqa: E402

client = TestClient(app)


def sign(body, key=KEY, timestamp=TIMESTAMP):
    """Sign like Samsara: v1= + hex HMAC-SHA256 of "v1:<timestamp>:<body>", keyed with the decoded secret."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    digest = hmac.new(key, b"v1:" + timestamp.encode() + b":" + raw, hashlib.sha256).hexdigest()
    return {"x-samsara-signature": "v1=" + digest, "x-samsara-timestamp": timestamp}


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    content = body.encode("utf-8") if isinstance(body, str) else body
    return client.post("/webhooks/samsara", content=content, headers=all_headers)


def without(headers, name):
    return {key: value for key, value in headers.items() if key != name}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SAMSARA_WEBHOOK_SECRET", SECRET)


def test_check_vector_built_from_the_sample_secret():
    assert verify_samsara_webhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)
    assert verify_samsara_webhook(VECTOR_BODY.encode(), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)


def test_vector_fails_with_another_timestamp_or_a_malformed_secret():
    assert not verify_samsara_webhook(VECTOR_BODY, VECTOR_SIGNATURE, "1587597110", SECRET)
    assert not verify_samsara_webhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, BAD_SECRET)


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "eventType": "Ping"}


def test_secret_used_as_utf8_text_is_rejected():
    assert post(BODY, sign(BODY, key=SECRET.encode("utf-8"))).status_code == 401


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, key=OTHER_KEY)).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY, without(sign(BODY), SIGNATURE_HEADER)).status_code == 401


def test_secret_with_trailing_newline_is_accepted(monkeypatch):
    monkeypatch.setenv("SAMSARA_WEBHOOK_SECRET", SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("SAMSARA_WEBHOOK_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500


def test_secret_that_is_not_base64_returns_500(monkeypatch):
    monkeypatch.setenv("SAMSARA_WEBHOOK_SECRET", BAD_SECRET)
    assert post(BODY, sign(BODY)).status_code == 500


def test_signature_without_v1_prefix_or_with_another_version_is_rejected():
    digest = sign(BODY)[SIGNATURE_HEADER][len("v1="):]
    assert post(BODY, {**sign(BODY), SIGNATURE_HEADER: digest}).status_code == 401
    assert post(BODY, {**sign(BODY), SIGNATURE_HEADER: "v2=" + digest}).status_code == 401


def test_changed_or_missing_timestamp_is_rejected():
    assert post(BODY, {**sign(BODY), "x-samsara-timestamp": "1731924901"}).status_code == 401
    assert post(BODY, without(sign(BODY), "x-samsara-timestamp")).status_code == 401


def test_dispatches_on_event_type():
    alert = '{"eventId":"a1","eventMs":1,"eventType":"Alert","event":{}}'
    assert post(alert, sign(alert)).json() == {"received": True, "eventType": "Alert"}
