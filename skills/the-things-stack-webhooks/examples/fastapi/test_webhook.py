# Generated with: the-things-stack-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import os

import pytest

# Synthetic credentials
USERNAME = "tts-webhook"
PASSWORD = "synthetic:pass-7Hq2"
os.environ["TTS_WEBHOOK_USERNAME"] = USERNAME
os.environ["TTS_WEBHOOK_PASSWORD"] = PASSWORD

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_basic_auth  # noqa: E402

client = TestClient(app)

UPLINK = '{"end_device_ids":{"device_id":"dev1","application_ids":{"application_id":"app1"},"dev_eui":"0004A30B001C0530","join_eui":"800000000000000C","dev_addr":"00BCB929"},"correlation_ids":["as:up:01E0WZGT6Y7657CPFPE5WEYDSQ"],"received_at":"2026-11-18T10:15:46.014773143Z","uplink_message":{"session_key_id":"AXA50tHUGUucuzS/bCGMNw==","f_port":1,"f_cnt":1,"frm_payload":"gkHe","decoded_payload":{"temperature":1.0,"luminosity":0.64},"rx_metadata":[{"gateway_ids":{"gateway_id":"gtw1","eui":"9C5C8E00001A05C4"},"rssi":-35,"channel_rssi":-35,"snr":5.2}],"settings":{"data_rate":{"lora":{"bandwidth":125000,"spreading_factor":7}},"frequency":"868300000"},"received_at":"2026-11-18T10:15:45.787Z"}}'
JOIN = '{"end_device_ids":{"device_id":"dev1","application_ids":{"application_id":"app1"},"dev_eui":"0004A30B001C0530","join_eui":"800000000000000C","dev_addr":"01497ECC"},"correlation_ids":["as:up:01E191YN5F2HMBQCBCVRF731VY"],"received_at":"2026-11-18T10:10:09.935284891Z","join_accept":{"session_key_id":"AXBSH1Pk6Z0G166RlH16CQ==","received_at":"2026-11-18T10:10:09.736532315Z"}}'


def basic(username=USERNAME, password=PASSWORD):
    """What the Console stores: Basic base64(<username>:<password>)."""
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


def post(body, authorization=None):
    headers = {"Content-Type": "application/json"}
    if authorization is not None:
        headers["Authorization"] = authorization
    return client.post("/webhooks/the-things-stack", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("TTS_WEBHOOK_USERNAME", USERNAME)
    monkeypatch.setenv("TTS_WEBHOOK_PASSWORD", PASSWORD)


def test_console_header_with_colon_in_password_is_accepted():
    assert verify_basic_auth(basic(), USERNAME, PASSWORD)


def test_scheme_name_is_case_insensitive():
    assert verify_basic_auth(basic().replace("Basic", "basic"), USERNAME, PASSWORD)


def test_other_schemes_and_malformed_credentials_are_rejected():
    assert not verify_basic_auth(f"Bearer {PASSWORD}", USERNAME, PASSWORD)
    assert not verify_basic_auth("Basic " + base64.b64encode(b"no-colon").decode(), USERNAME, PASSWORD)
    assert not verify_basic_auth("Basic !!!", USERNAME, PASSWORD)


def test_valid_credentials_are_accepted():
    res = post(UPLINK, basic())
    assert res.status_code == 200
    assert res.json() == {"received": True, "type": "uplink_message", "device_id": "dev1"}


def test_message_types_are_told_apart():
    res = post(JOIN, basic())
    assert res.status_code == 200
    assert res.json()["type"] == "join_accept"


def test_wrong_password_is_rejected():
    assert post(UPLINK, basic(USERNAME, "wrong")).status_code == 401


def test_wrong_username_is_rejected():
    assert post(UPLINK, basic("someone-else", PASSWORD)).status_code == 401


def test_missing_authorization_header_is_rejected():
    assert post(UPLINK).status_code == 401


def test_invalid_json_with_valid_credentials():
    assert post('{"truncated": ', basic()).status_code == 400


def test_fails_closed_without_credentials(monkeypatch):
    monkeypatch.delenv("TTS_WEBHOOK_PASSWORD")
    assert post(UPLINK, basic()).status_code == 500
