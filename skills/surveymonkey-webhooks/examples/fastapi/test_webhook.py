# Generated with: surveymonkey-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import os

import pytest

# Synthetic credentials
CLIENT_ID = "sm_synthetic_client_id_1a2b"
CLIENT_SECRET = "sm_synthetic_client_secret_3c4d5e6f"
os.environ["SURVEYMONKEY_CLIENT_ID"] = CLIENT_ID
os.environ["SURVEYMONKEY_CLIENT_SECRET"] = CLIENT_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_surveymonkey_signature  # noqa: E402

client = TestClient(app)

BODY = '{"name":"Survey responses","filter_type":"survey","filter_id":"405000001","event_type":"response_completed","event_id":"10000000001","object_type":"response","object_id":"118000000001","event_datetime":"2026-11-18T10:15:00.000000+00:00","resources":{"respondent_id":"118000000001","recipient_id":"0","collector_id":"431000001","survey_id":"405000001","user_id":"155000001"}}'
SURVEY_BODY = '{"name":"New surveys","filter_type":"survey","filter_id":"0","event_type":"survey_created","event_id":"10000000002","object_type":"survey","object_id":"405000002","event_datetime":"2026-11-18T10:20:00.000000+00:00","resources":{"survey_id":"405000002","user_id":"155000001"}}'
CONTENT_TYPE = "application/vnd.surveymonkey.response.v1+json"


def sign(body, key=f"{CLIENT_ID}&{CLIENT_SECRET}"):
    digest = hmac.new(key.encode("utf-8"), body.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def post(body, signature=None):
    headers = {"Content-Type": CONTENT_TYPE, "Sm-Apikey": CLIENT_ID}
    if signature is not None:
        headers["Sm-Signature"] = signature
    return client.post("/webhooks/surveymonkey", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SURVEYMONKEY_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("SURVEYMONKEY_CLIENT_SECRET", CLIENT_SECRET)


def test_key_is_client_id_ampersand_secret():
    assert verify_surveymonkey_signature(BODY, sign(BODY), CLIENT_ID, CLIENT_SECRET)


def test_signature_keyed_with_secret_alone_is_rejected():
    assert not verify_surveymonkey_signature(BODY, sign(BODY, CLIENT_SECRET), CLIENT_ID, CLIENT_SECRET)


def test_hex_signature_is_rejected():
    hex_sig = hmac.new(f"{CLIENT_ID}&{CLIENT_SECRET}".encode(), BODY.encode(), hashlib.sha1).hexdigest()
    assert not verify_surveymonkey_signature(BODY, hex_sig, CLIENT_ID, CLIENT_SECRET)


def test_head_check_returns_200():
    assert client.head("/webhooks/surveymonkey").status_code == 200


def test_valid_signature_is_accepted():
    res = post(BODY, sign(BODY))
    assert res.status_code == 200
    assert res.json() == {"received": True, "event_type": "response_completed", "event_id": "10000000001"}


def test_survey_event_is_handled():
    res = post(SURVEY_BODY, sign(SURVEY_BODY))
    assert res.status_code == 200
    assert res.json()["event_type"] == "survey_created"


def test_other_secret_is_rejected():
    assert post(BODY, sign(BODY, f"{CLIENT_ID}&wrong_secret")).status_code == 401


def test_tampered_body_is_rejected():
    assert post(BODY.replace('"405000001"', '"405000009"'), sign(BODY)).status_code == 401


def test_missing_signature_header_is_rejected():
    assert post(BODY).status_code == 401


def test_credentials_with_trailing_newline_are_accepted(monkeypatch):
    monkeypatch.setenv("SURVEYMONKEY_CLIENT_SECRET", CLIENT_SECRET + "\n")
    assert post(BODY, sign(BODY)).status_code == 200


def test_invalid_json_after_valid_signature():
    body = '{"truncated": '
    assert post(body, sign(body)).status_code == 400


def test_fails_closed_without_credentials(monkeypatch):
    monkeypatch.delenv("SURVEYMONKEY_CLIENT_SECRET")
    assert post(BODY, sign(BODY)).status_code == 500
    monkeypatch.setenv("SURVEYMONKEY_CLIENT_SECRET", CLIENT_SECRET)
    monkeypatch.delenv("SURVEYMONKEY_CLIENT_ID")
    assert post(BODY, sign(BODY)).status_code == 500
