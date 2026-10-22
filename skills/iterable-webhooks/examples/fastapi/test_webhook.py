import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516"
os.environ["ITERABLE_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, verify_iterable_request

client = TestClient(app)

# Shapes taken from Iterable's documented example payloads (trimmed)
EMAIL_SEND = {
    "email": "user@example.com",
    "eventName": "emailSend",
    "dataFields": {"campaignId": 59667, "messageId": "9c438a20d26e4e9f8ad4edea23f811cd", "emailSubject": "My subject"},
}
EMAIL_OPEN = {"email": "user@example.com", "eventName": "emailOpen", "dataFields": {"campaignId": 49313, "isBot": False}}
EMAIL_BOUNCE = {"email": "user@example.com", "eventName": "emailBounce", "dataFields": {"recipientState": "HardBounce"}}
EMAIL_UNSUBSCRIBE = {"email": "user@example.com", "eventName": "emailUnSubscribe", "dataFields": {"unsubSource": "EmailLink"}}


def post(body, headers=None, content_type="application/json"):
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/iterable",
        content=data,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def test_accepts_full_bearer_authorization_value():
    res = post(EMAIL_SEND, {"Authorization": AUTH})
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_basic_value_compared_as_is_never_decoded():
    config = {"ITERABLE_AUTHORIZATION": "Basic abc123"}  # not valid base64 user:pass, still fine
    assert verify_iterable_request({"authorization": "Basic abc123"}, config) is True
    assert verify_iterable_request({"authorization": "Basic YWJjMTIz"}, config) is False


def test_rejects_missing_authorization_header():
    assert post(EMAIL_SEND).status_code == 401


def test_rejects_wrong_credential():
    res = post(EMAIL_SEND, {"Authorization": "Bearer 00000000-0000-0000-0000-000000000000"})
    assert res.status_code == 401


def test_rejects_token_without_bearer_prefix():
    res = post(EMAIL_SEND, {"Authorization": AUTH.replace("Bearer ", "")})
    assert res.status_code == 401


def test_non_ascii_expected_value_does_not_raise():
    config = {"ITERABLE_AUTHORIZATION": "Bearer café"}
    assert verify_iterable_request({"authorization": "Bearer café"}, config) is True
    assert verify_iterable_request({"authorization": "Bearer cafe"}, config) is False


def test_rejects_before_parsing():
    assert post("not json").status_code == 401


def test_authenticates_regardless_of_content_type():
    res = post(json.dumps(EMAIL_OPEN), {"Authorization": AUTH}, "text/plain")
    assert res.status_code == 200


def test_returns_400_for_invalid_json():
    assert post("not json", {"Authorization": AUTH}).status_code == 400


def test_returns_400_for_json_array():
    assert post("[1,2]", {"Authorization": AUTH}).status_code == 400


def test_accepts_documented_event_names_including_unknown():
    for body in (EMAIL_OPEN, EMAIL_BOUNCE, EMAIL_UNSUBSCRIBE, {"eventName": "journeyExit", "email": "a@b.co"}):
        assert post(body, {"Authorization": AUTH}).status_code == 200


def test_never_accepts_when_unconfigured():
    assert verify_iterable_request({"authorization": "Bearer x"}, {}) is False
    assert verify_iterable_request({"authorization": ""}, {"ITERABLE_AUTHORIZATION": ""}) is False
